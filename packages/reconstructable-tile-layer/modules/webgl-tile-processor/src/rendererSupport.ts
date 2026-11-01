import { getIdentityTextureCoordData, initShaderProgram } from "./glInitFunc.js";
import { clipFS, defaultFS, defaultVS, maskFS, maskVS } from "./shader/defaultShaders.js";
import type { CesiumTileProcesserOptions, TileProgramInfo, WebGLContextInfo } from "./types.js";

export function createProgramInfo(
  gl: WebGLRenderingContext,
  options: CesiumTileProcesserOptions,
): TileProgramInfo {
  const vsSource = options.vsSource ?? defaultVS;
  const fsSource = options.fsSource ?? defaultFS;
  const fsSourceClip = options.fsSource ?? clipFS;

  const defaultShaderProgram = initShaderProgram(gl, vsSource, fsSource);
  const clipShaderProgram = initShaderProgram(gl, vsSource, fsSourceClip);
  const maskShaderProgram = initShaderProgram(gl, maskVS, maskFS);
  if (!defaultShaderProgram || !clipShaderProgram || !maskShaderProgram) {
    throw new Error("初始化着色器程序失败");
  }

  return {
    defaultProgramInfo: {
      program: defaultShaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(defaultShaderProgram, "aVertexPosition"),
        textureCoord: gl.getAttribLocation(defaultShaderProgram, "aTextureCoord"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(defaultShaderProgram, "uProjectionMatrix"),
        modelViewMatrix: gl.getUniformLocation(defaultShaderProgram, "uModelViewMatrix"),
        uSampler: gl.getUniformLocation(defaultShaderProgram, "uSampler"),
      },
    },
    clipProgramInfo: {
      program: clipShaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(clipShaderProgram, "aVertexPosition"),
        textureCoord: gl.getAttribLocation(clipShaderProgram, "aTextureCoord"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(clipShaderProgram, "uProjectionMatrix"),
        modelViewMatrix: gl.getUniformLocation(clipShaderProgram, "uModelViewMatrix"),
        uSampler: gl.getUniformLocation(clipShaderProgram, "uSampler"),
        polygonVerticesCount: gl.getUniformLocation(clipShaderProgram, "polygonVerticesCount"),
        polygonVertices: gl.getUniformLocation(clipShaderProgram, "polygonVertices"),
      },
    },
    maskProgramInfo: {
      program: maskShaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(maskShaderProgram, "aVertexPosition"),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(maskShaderProgram, "uProjectionMatrix"),
        modelViewMatrix: gl.getUniformLocation(maskShaderProgram, "uModelViewMatrix"),
      },
    },
  };
}

export function createIdentityTextureCoordBuffer(gl: WebGLRenderingContext, vertexRowNum: number) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, getIdentityTextureCoordData(vertexRowNum), gl.STATIC_DRAW);
  return buffer;
}

export function getDefaultLegacyPoolSize() {
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    return Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency / 2)));
  }
  return 3;
}

export function normalizeLegacyPoolSize(poolSize: number) {
  return Math.min(4, Math.max(1, Math.floor(poolSize)));
}

export function normalizeSlotCount(slotCount: number) {
  return Math.min(8, Math.max(1, Math.floor(slotCount)));
}

export const EMPTY_WEBGL_CONTEXT_INFO: WebGLContextInfo = {
  webglVersion: "unavailable",
  shadingLanguageVersion: "unavailable",
  vendor: "unavailable",
  renderer: "unavailable",
};

export function readWebGLContextInfo(gl: WebGLRenderingContext): WebGLContextInfo {
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as {
    UNMASKED_VENDOR_WEBGL: number;
    UNMASKED_RENDERER_WEBGL: number;
  } | null;

  return {
    webglVersion: String(gl.getParameter(gl.VERSION)),
    shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
    vendor: String(gl.getParameter(debugInfo?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
    renderer: String(gl.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)),
  };
}
