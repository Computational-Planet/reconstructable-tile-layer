import {
  createEmptyTexture,
  drawScene,
  drawSceneClipped,
  drawSceneMasked,
  initPositionBuffer,
  updateTextureCoordBuffer,
  uploadImageToTexture,
} from "../glInitFunc.js";
import { cloneCanvas } from "../canvas.js";
import {
  createIdentityTextureCoordBuffer,
  createProgramInfo,
  normalizeSlotCount,
  readWebGLContextInfo,
} from "../rendererSupport.js";
import { now } from "../time.js";
import type {
  Buffers,
  CesiumTileProcesserOptions,
  RendererPool,
  RenderJob,
  RenderWorker,
  TileProgramInfo,
} from "../types.js";

class SingleContextRenderSlot implements RenderWorker {
  busy = false;
  inputTexture: WebGLTexture | null;
  outputTexture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
  depthStencilBuffer: WebGLRenderbuffer | null;
  textureCoordBuffer: WebGLBuffer | null;

  constructor(
    private renderer: SingleContextTileRenderer,
    readonly index: number,
  ) {
    const gl = renderer.context;
    this.inputTexture = createEmptyTexture(gl, renderer.width, renderer.height);
    this.outputTexture = createEmptyTexture(gl, renderer.width, renderer.height);
    this.framebuffer = gl.createFramebuffer();
    this.depthStencilBuffer = gl.createRenderbuffer();
    this.textureCoordBuffer = gl.createBuffer();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outputTexture,
      0,
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthStencilBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, renderer.width, renderer.height);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      this.depthStencilBuffer,
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`FBO 初始化失败，slot=${index}, status=${status}`);
    }
  }

  render(job: Omit<RenderJob, "resolve" | "reject">) {
    return this.renderer.renderSlot(this, job);
  }

  destroy(gl: WebGLRenderingContext) {
    gl.deleteTexture(this.inputTexture);
    gl.deleteTexture(this.outputTexture);
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteRenderbuffer(this.depthStencilBuffer);
    gl.deleteBuffer(this.textureCoordBuffer);
    this.inputTexture = null;
    this.outputTexture = null;
    this.framebuffer = null;
    this.depthStencilBuffer = null;
    this.textureCoordBuffer = null;
  }
}

export class SingleContextTileRenderer implements RendererPool {
  workers: SingleContextRenderSlot[] = [];
  private _canvas: HTMLCanvasElement;
  private _context: WebGLRenderingContext;
  private _programInfo: TileProgramInfo;
  private _buffers: Buffers;
  private _displayBuffers: Buffers;
  private _vertexRowNum: number;
  private _contextLostCount = 0;
  private _destroyed = false;

  constructor(canvas: HTMLCanvasElement, options: CesiumTileProcesserOptions) {
    this._canvas = canvas;
    this._canvas.width = options.width ?? 256;
    this._canvas.height = options.height ?? 256;
    this._canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this._contextLostCount++;
    });

    const context = this._canvas.getContext("webgl", {
      alpha: true,
      stencil: true,
    });
    if (!context) {
      throw new Error("无法初始化WebGL，你的浏览器、操作系统或硬件可能不支持WebGL");
    }
    this._context = context;
    this._context.clearColor(0.0, 0.0, 0.0, 0.0);
    this._context.clear(this._context.COLOR_BUFFER_BIT);

    this._programInfo = createProgramInfo(this._context, options);
    this._vertexRowNum = options.vertexRowNum ?? 64;
    const position = initPositionBuffer(this._context, this._vertexRowNum);
    const screenTextureCoord = createIdentityTextureCoordBuffer(this._context, this._vertexRowNum);
    this._buffers = {
      position,
      textureCoord: null,
    };
    this._displayBuffers = {
      position,
      textureCoord: screenTextureCoord,
    };

    const slotCount = normalizeSlotCount(options.slotCount ?? options.poolSize ?? 4);
    for (let i = 0; i < slotCount; i++) {
      this.workers.push(new SingleContextRenderSlot(this, i));
    }
  }

  get context() {
    return this._context;
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

  async renderSlot(slot: SingleContextRenderSlot, job: Omit<RenderJob, "resolve" | "reject">) {
    if (this._destroyed) {
      return null;
    }

    const { x, y, level, provider, image, polygonVerticesList, clipMaskVertices } = job;
    const gl = this._context;

    const slotStart = now();
    const renderQueueWaitMs = Math.max(0, slotStart - job.queuedAt);
    updateTextureCoordBuffer(
      gl,
      slot.textureCoordBuffer,
      this._vertexRowNum,
      provider,
      x,
      y,
      level,
    );
    uploadImageToTexture(gl, slot.inputTexture, image, false);
    const textureUploadMs = now() - slotStart;

    const drawStart = now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    this._buffers.textureCoord = slot.textureCoordBuffer;
    if (clipMaskVertices?.length) {
      drawSceneMasked(
        gl,
        this._vertexRowNum,
        this._programInfo.defaultProgramInfo,
        this._programInfo.maskProgramInfo,
        slot.inputTexture,
        this._buffers,
        clipMaskVertices,
      );
    } else if (polygonVerticesList?.length) {
      polygonVerticesList.forEach((polygonVertices, index) => {
        drawSceneClipped(
          gl,
          this._vertexRowNum,
          this._programInfo.clipProgramInfo,
          slot.inputTexture,
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
        slot.inputTexture,
        this._buffers,
      );
    }
    const drawMs = now() - drawStart;

    // Copy the slot FBO result to the default framebuffer before snapshotting.
    const copyStart = now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    drawScene(
      gl,
      this._vertexRowNum,
      this._programInfo.defaultProgramInfo,
      slot.outputTexture,
      this._displayBuffers,
    );
    gl.flush();
    const copyToCanvasMs = now() - copyStart;

    // Encoding runs in a separate queue after this synchronous snapshot.
    const snapshotStart = now();
    const snapshotCanvas = cloneCanvas(this._canvas);
    const snapshotMs = now() - snapshotStart;

    return {
      snapshotCanvas,
      timing: {
        renderQueueWaitMs,
        textureUploadMs,
        drawMs,
        copyToCanvasMs,
        snapshotMs,
        slotHoldMs: now() - slotStart,
      },
    };
  }

  destroy() {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this.workers.forEach((slot) => slot.destroy(this._context));
    this.workers = [];
    this._context.deleteBuffer(this._buffers.position);
    this._context.deleteBuffer(this._displayBuffers.textureCoord);
    this._context.deleteProgram(this._programInfo.defaultProgramInfo.program);
    this._context.deleteProgram(this._programInfo.clipProgramInfo.program);
    this._context.deleteProgram(this._programInfo.maskProgramInfo.program);
    this._context.getExtension("WEBGL_lose_context")?.loseContext();
    this._buffers = { position: null, textureCoord: null };
    this._displayBuffers = { position: null, textureCoord: null };
    this._canvas.width = 0;
    this._canvas.height = 0;
  }

  getStats() {
    return {
      contextCount: 1,
      slotCount: this.workers.length,
      busySlotCount: this.workers.filter((slot) => slot.busy).length,
      contextLostCount: this._contextLostCount,
    };
  }

  getContextInfo() {
    return readWebGLContextInfo(this._context);
  }
}
