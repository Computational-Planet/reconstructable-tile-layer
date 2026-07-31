import {
  drawScene,
  drawSceneClipped,
  drawSceneMasked,
  generateTexture,
  initPositionBuffer,
  initTextureCoordBuffer,
} from "../glInitFunc.js";
import { cloneCanvas, createInternalCanvas } from "../canvas.js";
import {
  createProgramInfo,
  EMPTY_WEBGL_CONTEXT_INFO,
  getDefaultLegacyPoolSize,
  normalizeLegacyPoolSize,
  readWebGLContextInfo,
} from "../rendererSupport.js";
import { now } from "../time.js";
import type {
  Buffers,
  CesiumTileProcesserOptions,
  RendererPool,
  RenderJob,
  RenderWorker,
  TileImageAsset,
  TileProgramInfo,
  TileXYZ,
} from "../types.js";

class LegacyCanvasTileRenderer implements RenderWorker {
  busy = false;
  private _canvas: HTMLCanvasElement;
  private _context: WebGLRenderingContext | null;
  private _programInfo: TileProgramInfo;
  private _buffers: Buffers;
  private _vertexRowNum: number;
  private _currentTileXYZ: TileXYZ | undefined = undefined;
  private _currentResult: TileImageAsset | null = null;
  private _destroyed = false;
  private _contextLostCount = 0;

  constructor(canvas: HTMLCanvasElement, options: CesiumTileProcesserOptions) {
    this._canvas = canvas;
    this._canvas.width = options.width ?? 256;
    this._canvas.height = options.height ?? 256;
    this._canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this._contextLostCount++;
    });

    this._context = this._canvas.getContext("webgl", {
      alpha: true,
      stencil: true,
    });
    if (!this._context) {
      throw new Error("无法初始化WebGL，你的浏览器、操作系统或硬件可能不支持WebGL");
    }
    this._context.clearColor(0.0, 0.0, 0.0, 0.0);
    this._context.clear(this._context.COLOR_BUFFER_BIT);

    this._programInfo = createProgramInfo(this._context, options);
    this._vertexRowNum = options.vertexRowNum ?? 64;
    this._buffers = {
      position: initPositionBuffer(this._context, this._vertexRowNum),
      textureCoord: null,
    };
  }

  get width() {
    return this._canvas.width;
  }

  get height() {
    return this._canvas.height;
  }

  get canvas() {
    return this._canvas;
  }

  get vertexRowNum() {
    return this._vertexRowNum;
  }

  get contextLostCount() {
    return this._contextLostCount;
  }

  getContextInfo() {
    return this._context ? readWebGLContextInfo(this._context) : EMPTY_WEBGL_CONTEXT_INFO;
  }

  get currentTileXYZ() {
    return this._currentTileXYZ;
  }

  get currentResult() {
    return this._currentResult;
  }

  async render(job: Omit<RenderJob, "resolve" | "reject">) {
    if (this._destroyed || !this._context) {
      return null;
    }

    const { x, y, level, provider, image, polygonVerticesList, clipMaskVertices } = job;
    const gl = this._context;
    this._currentTileXYZ = { x, y, z: level };

    const slotStart = now();
    const renderQueueWaitMs = Math.max(0, slotStart - job.queuedAt);
    const textureCoordBuffer = initTextureCoordBuffer(
      gl,
      this._vertexRowNum,
      provider,
      x,
      y,
      level,
    );
    this._buffers.textureCoord = textureCoordBuffer;
    const texture = generateTexture(gl, image);
    const textureUploadMs = now() - slotStart;

    try {
      const drawStart = now();
      if (clipMaskVertices?.length) {
        drawSceneMasked(
          gl,
          this._vertexRowNum,
          this._programInfo.defaultProgramInfo,
          this._programInfo.maskProgramInfo,
          texture,
          this._buffers,
          clipMaskVertices,
        );
      } else if (polygonVerticesList?.length) {
        polygonVerticesList.forEach((polygonVertices, index) => {
          drawSceneClipped(
            gl,
            this._vertexRowNum,
            this._programInfo.clipProgramInfo,
            texture,
            this._buffers,
            polygonVertices,
            { clear: index === 0 },
          );
        });
      } else {
        drawScene(
          gl,
          this._vertexRowNum,
          this._programInfo.defaultProgramInfo,
          texture,
          this._buffers,
        );
      }
      gl.flush();
      const drawMs = now() - drawStart;

      const snapshotStart = now();
      const snapshotCanvas = cloneCanvas(this._canvas);
      const snapshotMs = now() - snapshotStart;

      return {
        snapshotCanvas,
        timing: {
          renderQueueWaitMs,
          textureUploadMs,
          drawMs,
          copyToCanvasMs: 0,
          snapshotMs,
          slotHoldMs: now() - slotStart,
        },
      };
    } finally {
      gl.deleteTexture(texture);
      gl.deleteBuffer(textureCoordBuffer);
      if (this._buffers.textureCoord === textureCoordBuffer) {
        this._buffers.textureCoord = null;
      }
    }
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    if (this._context) {
      this._context.deleteBuffer(this._buffers.position);
      if (this._buffers.textureCoord) {
        this._context.deleteBuffer(this._buffers.textureCoord);
      }
      this._context.deleteProgram(this._programInfo.defaultProgramInfo.program);
      this._context.deleteProgram(this._programInfo.clipProgramInfo.program);
      this._context.deleteProgram(this._programInfo.maskProgramInfo.program);
      this._context.getExtension("WEBGL_lose_context")?.loseContext();
      this._context = null;
    }

    this._buffers = { position: null, textureCoord: null };
    this._canvas.width = 0;
    this._canvas.height = 0;
  }
}

export class LegacyCanvasRendererPool implements RendererPool {
  workers: LegacyCanvasTileRenderer[] = [];

  constructor(externalCanvas: HTMLCanvasElement | undefined, options: CesiumTileProcesserOptions) {
    const poolSize = externalCanvas
      ? 1
      : normalizeLegacyPoolSize(options.poolSize ?? getDefaultLegacyPoolSize());

    for (let i = 0; i < poolSize; i++) {
      const canvas = i === 0 && externalCanvas ? externalCanvas : createInternalCanvas(options);
      this.workers.push(new LegacyCanvasTileRenderer(canvas, options));
    }
  }

  get width() {
    return this.workers[0]?.width ?? 0;
  }

  get height() {
    return this.workers[0]?.height ?? 0;
  }

  get canvas() {
    return this.workers[0]?.canvas;
  }

  get vertexRowNum() {
    return this.workers[0]?.vertexRowNum ?? 0;
  }

  destroy() {
    this.workers.forEach((renderer) => renderer.destroy());
    this.workers = [];
  }

  getStats() {
    return {
      contextCount: this.workers.length,
      slotCount: this.workers.length,
      busySlotCount: this.workers.filter((renderer) => renderer.busy).length,
      contextLostCount: this.workers.reduce((sum, renderer) => sum + renderer.contextLostCount, 0),
    };
  }

  getContextInfo() {
    return this.workers[0]?.getContextInfo() ?? EMPTY_WEBGL_CONTEXT_INFO;
  }
}
