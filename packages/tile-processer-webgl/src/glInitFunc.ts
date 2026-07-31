import {
  Math as CesiumMath,
  Rectangle,
  WebMercatorTilingScheme,
  type ImageryProvider,
  type ImageryTypes,
} from "cesium";
import { mat4 } from "gl-matrix";
import type { Buffers, WebGLProgramInfo } from "./types.js";
import { isPowerOf2 } from "./utils/math.js";

function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("创建指定类型shader失败");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error("编译着色器时出现错误: " + gl.getShaderInfoLog(shader));
  }
  return shader;
}

export function initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const shaderProgram = gl.createProgram();
  if (!shaderProgram) {
    throw new Error("创建着色器程序失败！");
  }
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw new Error("无法初始化着色器程序: " + gl.getProgramInfoLog(shaderProgram));
  }
  return shaderProgram;
}

export function initPositionBuffer(gl: WebGLRenderingContext, vertexRowNum: number) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  const positions = new Float32Array(2 * vertexRowNum * 2);
  let index = 0;
  for (let j = 0; j < vertexRowNum; ++j) {
    const y = j / (vertexRowNum - 1);
    positions[index++] = 0.0;
    positions[index++] = y;
    positions[index++] = 1.0;
    positions[index++] = y;
  }

  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  return positionBuffer;
}

export function initTextureCoordBuffer(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  provider: ImageryProvider,
  x: number,
  y: number,
  level: number,
) {
  const textureCoordBuffer = gl.createBuffer();
  updateTextureCoordBuffer(gl, textureCoordBuffer, vertexRowNum, provider, x, y, level);
  return textureCoordBuffer;
}

export function updateTextureCoordBuffer(
  gl: WebGLRenderingContext,
  textureCoordBuffer: WebGLBuffer | null,
  vertexRowNum: number,
  provider: ImageryProvider,
  x: number,
  y: number,
  level: number,
) {
  if (!textureCoordBuffer) {
    return;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    getTextureCoordData(vertexRowNum, provider, x, y, level),
    gl.STATIC_DRAW,
  );
}

export function getIdentityTextureCoordData(vertexRowNum: number) {
  const positions = new Float32Array(2 * vertexRowNum * 2);
  let index = 0;
  for (let j = 0; j < vertexRowNum; ++j) {
    const y = j / (vertexRowNum - 1);
    positions[index++] = 0.0;
    positions[index++] = y;
    positions[index++] = 1.0;
    positions[index++] = y;
  }
  return positions;
}

function getTextureCoordData(
  vertexRowNum: number,
  provider: ImageryProvider,
  x: number,
  y: number,
  level: number,
) {
  if (provider.tilingScheme instanceof WebMercatorTilingScheme) {
    const rectangle = provider.tilingScheme.tileXYToRectangle(x, y, level, new Rectangle());
    const sinLatitudeSouth = Math.sin(rectangle.south);
    const southMercatorY = 0.5 * Math.log((1 + sinLatitudeSouth) / (1 - sinLatitudeSouth));
    const sinLatitudeNorth = Math.sin(rectangle.north);
    const northMercatorY = 0.5 * Math.log((1 + sinLatitudeNorth) / (1 - sinLatitudeNorth));
    const oneOverMercatorHeight = 1.0 / (northMercatorY - southMercatorY);
    const south = rectangle.south;
    const north = rectangle.north;
    const webMercatorT = new Float32Array(2 * vertexRowNum * 2);
    let outputIndex = 0;
    for (let webMercatorTIndex = 0; webMercatorTIndex < vertexRowNum; ++webMercatorTIndex) {
      const fraction = webMercatorTIndex / (vertexRowNum - 1);
      const latitude = CesiumMath.lerp(south, north, fraction);
      const sinLatitude = Math.sin(latitude);
      const mercatorY = 0.5 * Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude));
      const mercatorFraction = (mercatorY - southMercatorY) * oneOverMercatorHeight;
      webMercatorT[outputIndex++] = 0.0;
      webMercatorT[outputIndex++] = mercatorFraction;
      webMercatorT[outputIndex++] = 1.0;
      webMercatorT[outputIndex++] = mercatorFraction;
    }
    return webMercatorT;
  }

  return getIdentityTextureCoordData(vertexRowNum);
}

export function generateTexture(gl: WebGLRenderingContext, image: ImageryTypes) {
  const texture = gl.createTexture();
  uploadImageToTexture(gl, texture, image, true);
  return texture;
}

export function uploadImageToTexture(
  gl: WebGLRenderingContext,
  texture: WebGLTexture | null,
  image: ImageryTypes,
  allowMipMap = false,
) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  if (allowMipMap && isPowerOf2(image.width) && isPowerOf2(image.height)) {
    gl.generateMipmap(gl.TEXTURE_2D);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

export function createEmptyTexture(gl: WebGLRenderingContext, width: number, height: number) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function setPositionAttribute(
  gl: WebGLRenderingContext,
  buffers: Buffers,
  programInfo: WebGLProgramInfo,
) {
  const numComponents = 2;
  const type = gl.FLOAT;
  const normalize = false;
  const stride = 0;
  const offset = 0;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.vertexAttribPointer(
    programInfo.attribLocations.vertexPosition,
    numComponents,
    type,
    normalize,
    stride,
    offset,
  );
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
}

function setTextureCoordAttribute(
  gl: WebGLRenderingContext,
  buffers: Buffers,
  programInfo: WebGLProgramInfo,
) {
  const num = 2;
  const type = gl.FLOAT;
  const normalize = false;
  const stride = 0;
  const offset = 0;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
  gl.vertexAttribPointer(
    programInfo.attribLocations.textureCoord,
    num,
    type,
    normalize,
    stride,
    offset,
  );
  gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
}

function setMaskPositionAttribute(
  gl: WebGLRenderingContext,
  maskVertexBuffer: WebGLBuffer,
  programInfo: WebGLProgramInfo,
) {
  gl.bindBuffer(gl.ARRAY_BUFFER, maskVertexBuffer);
  gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
}

function drawTexturedQuad(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  programInfo: WebGLProgramInfo,
  texture: WebGLTexture | null,
  buffers: Buffers,
) {
  const projectionMatrix = mat4.create();
  const modelViewMatrix = mat4.create();

  setPositionAttribute(gl, buffers, programInfo);
  setTextureCoordAttribute(gl, buffers, programInfo);
  gl.useProgram(programInfo.program);
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

  const offset = 0;
  const vertexCount = vertexRowNum * 2;
  gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
}

function drawScene(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  programInfo: WebGLProgramInfo,
  texture: WebGLTexture | null,
  buffers: Buffers,
) {
  if (!("clientWidth" in gl.canvas)) {
    alert("canvas 类型有误");
    return;
  }

  gl.disable(gl.STENCIL_TEST);
  gl.stencilMask(0xff);
  gl.colorMask(true, true, true, true);
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawTexturedQuad(gl, vertexRowNum, programInfo, texture, buffers);
}

function drawSceneMasked(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  defaultProgramInfo: WebGLProgramInfo,
  maskProgramInfo: WebGLProgramInfo,
  texture: WebGLTexture | null,
  buffers: Buffers,
  maskVertices: Float32Array,
) {
  if (!("clientWidth" in gl.canvas)) {
    alert("canvas 类型有误");
    return;
  }

  const maskVertexCount = Math.floor(maskVertices.length / 2);
  if (maskVertexCount < 3) {
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    return;
  }

  const maskVertexBuffer = gl.createBuffer();
  if (!maskVertexBuffer) {
    throw new Error("创建裁剪遮罩顶点缓冲失败");
  }

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.STENCIL_TEST);
  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clearDepth(1.0);
  gl.clearStencil(0);
  gl.stencilMask(0xff);
  gl.colorMask(true, true, true, true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, maskVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, maskVertices, gl.STATIC_DRAW);
    gl.useProgram(maskProgramInfo.program);
    setMaskPositionAttribute(gl, maskVertexBuffer, maskProgramInfo);

    const projectionMatrix = mat4.create();
    const modelViewMatrix = mat4.create();
    gl.uniformMatrix4fv(maskProgramInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(maskProgramInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
    gl.drawArrays(gl.TRIANGLES, 0, maskVertexCount);

    gl.colorMask(true, true, true, true);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    drawTexturedQuad(gl, vertexRowNum, defaultProgramInfo, texture, buffers);
  } finally {
    gl.deleteBuffer(maskVertexBuffer);
    gl.stencilMask(0xff);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true);
  }
}

function drawSceneClipped(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  programInfo: WebGLProgramInfo,
  texture: WebGLTexture | null,
  buffers: Buffers,
  polygonVertices: Array<number>,
  options: { clear?: boolean } = {},
) {
  if (!("clientWidth" in gl.canvas)) {
    alert("canvas 类型有误");
    return;
  }

  gl.clearColor(0.0, 0.0, 0.0, 0.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  if (options.clear ?? true) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  const projectionMatrix = mat4.create();
  const modelViewMatrix = mat4.create();
  setPositionAttribute(gl, buffers, programInfo);
  setTextureCoordAttribute(gl, buffers, programInfo);
  gl.useProgram(programInfo.program);
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(programInfo.uniformLocations.uSampler, 0);
  gl.uniform1iv(
    programInfo.uniformLocations.polygonVerticesCount,
    new Int32Array([polygonVertices.length / 2]),
  );
  gl.uniform2fv(programInfo.uniformLocations.polygonVertices, new Float32Array(polygonVertices));

  const offset = 0;
  const vertexCount = vertexRowNum * 2;
  gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
}

export { drawScene, drawSceneClipped, drawSceneMasked };
