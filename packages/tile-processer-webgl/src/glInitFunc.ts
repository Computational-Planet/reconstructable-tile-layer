import {
  ImageryProvider,
  Rectangle,
  Math as CesiumMath,
  ImageryTypes,
  WebMercatorTilingScheme,
} from "cesium";
import { isPowerOf2 } from "./utils/math";
import { Buffers, WebGLProgramInfo } from "./cesium-tile-processer";
import { mat4 } from "gl-matrix";

// 加载、编译着色器程序（顶点着色器和片段着色器根据type区分）
function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  //注：这个type是WebGL预先定义的常量，可以用gl.VERTEX_SHADER与gl.FRAGMENT_SHADER获取
  const shader = gl.createShader(type);
  //如果创建shader失败，则
  if (!shader) {
    throw new Error("创建指定类型shader失败");
  }
  //为刚才创建的Shader对象赋予源码（这个源码就是我们事先写好的glsl代码，用string类型传入）
  gl.shaderSource(shader, source);
  //编译着色器程序
  gl.compileShader(shader);
  //检查是否编译成功，若失败要删除对象，释放空间
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error("编译着色器时出现错误: " + gl.getShaderInfoLog(shader));
  }
  return shader;
}
// 初始化着色器程序，让 WebGL 知道如何绘制我们的数据
export function initShaderProgram(
  gl: WebGLRenderingContext,
  vsSource: string,
  fsSource: string
) {
  // 加载、编译顶点着色器
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  // 加载、编译片段着色器
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  // 创建和初始化一个 WebGLProgram 对象
  // （一个 WebGLProgram 对象由两个编译过后的 WebGLShader 组成
  // 即顶点着色器和片段着色器（均由 GLSL 语言所写）。这些组合成一个可用的 WebGL 着色器程序。）
  const shaderProgram = gl.createProgram();
  // 检测着色器程序是否创建成功
  if (!shaderProgram) {
    throw new Error("创建着色器程序失败！");
  }
  //将之前获取的顶点和片段着色器绑定到着色器程序
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  //将着色器程序连接到gl上下文，从而完成程序的顶点、片元着色器准备GPU代码的过程
  gl.linkProgram(shaderProgram);
  // 如果创建失败，alert
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw new Error(
      "无法初始化着色器程序: " + gl.getProgramInfoLog(shaderProgram)
    );
  }
  return shaderProgram;
}
export function initPositionBuffer(
  gl: WebGLRenderingContext,
  vertexRowNum: number
) {
  // 为正方形的顶点创建缓冲器
  const positionBuffer = gl.createBuffer();
  //绑定上下文
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  //顶点的空间在x和y方向都是从-1，1。（纹理坐标不同，是从0到1）
  //创建一个数组来记录正方形的每一个顶点（这里在做Cesium瓦片重投影，设置了2*64个顶点在瓦片左右两边）
  //const positions = [1.0, 1.0, 0, 1.0, 1.0, 0, 0, 0];
  const positions = new Float32Array(2 * vertexRowNum * 2);
  let index = 0;
  for (let j = 0; j < vertexRowNum; ++j) {
    const y = j / (vertexRowNum - 1);
    positions[index++] = 0.0;
    positions[index++] = y;
    positions[index++] = 1.0;
    positions[index++] = y;
  }

  //然后将其转化为 WebGL 浮点型类型的数组，并将其传到 gl 对象的 bufferData() 方法来填充对应的顶点缓冲器。
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  return positionBuffer;
}
export function initTextureCoordBuffer(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  provider: ImageryProvider,
  x: number,
  y: number,
  level: number
) {
  // 为纹理坐标创建buffer
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
  level: number
) {
  if (!textureCoordBuffer) {
    return;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    getTextureCoordData(vertexRowNum, provider, x, y, level),
    gl.STATIC_DRAW
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
  level: number
) {
  //仅在tilingScheme为WebMercator时才需要进行重投影（转化为等距投影）
  if (provider.tilingScheme instanceof WebMercatorTilingScheme) {
    // 若投影方式为Web墨卡托，则需要进行重投影。这里需要逐顶点计算纹理坐标（使最终结果经纬度等距）
    // 根据瓦片位置创建瓦片范围矩形
    const rectangle = provider.tilingScheme.tileXYToRectangle(
      x,
      y,
      level,
      new Rectangle()
    );
    let sinLatitudeSouth = Math.sin(rectangle.south);
    const southMercatorY =
      0.5 * Math.log((1 + sinLatitudeSouth) / (1 - sinLatitudeSouth));
    let sinLatitudeNorth = Math.sin(rectangle.north);
    const northMercatorY =
      0.5 * Math.log((1 + sinLatitudeNorth) / (1 - sinLatitudeNorth));
    const oneOverMercatorHeight = 1.0 / (northMercatorY - southMercatorY);
    const south = rectangle.south;
    const north = rectangle.north;
    const webMercatorT = new Float32Array(2 * vertexRowNum * 2);
    let outputIndex = 0;
    for (
      let webMercatorTIndex = 0;
      webMercatorTIndex < vertexRowNum;
      ++webMercatorTIndex
    ) {
      const fraction = webMercatorTIndex / (vertexRowNum - 1);
      const latitude = CesiumMath.lerp(south, north, fraction);
      let sinLatitude = Math.sin(latitude);
      const mercatorY =
        0.5 * Math.log((1.0 + sinLatitude) / (1.0 - sinLatitude));
      const mercatorFraction =
        (mercatorY - southMercatorY) * oneOverMercatorHeight;
      webMercatorT[outputIndex++] = 0.0;
      webMercatorT[outputIndex++] = mercatorFraction;
      webMercatorT[outputIndex++] = 1.0;
      webMercatorT[outputIndex++] = mercatorFraction;
    }

    return webMercatorT;
  }

  // 若为4326，则直接以顶点坐标的相同方法设置纹理坐标
  return getIdentityTextureCoordData(vertexRowNum);
}

export function generateTexture(
  gl: WebGLRenderingContext,
  image: ImageryTypes
) {
  // 创建瓦片纹理
  const texture = gl.createTexture();
  uploadImageToTexture(gl, texture, image, true);
  return texture;
}

export function uploadImageToTexture(
  gl: WebGLRenderingContext,
  texture: WebGLTexture | null,
  image: ImageryTypes,
  allowMipMap = false
) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // level
    gl.RGBA, // internalFormat
    gl.RGBA, // srcFormat
    gl.UNSIGNED_BYTE, // srcType
    image
  );

  // WebGL1对2的幂尺寸的图像和非2的幂尺寸的图像有不同的要求。
  // 对于2的幂尺寸的图像，可以利用Mipmap（多级渐进纹理）提高渲染效率；
  // 而对于非2的幂尺寸的图像，则需要关闭Mipmap并使用CLAMP_TO_EDGE来避免纹理坐标越界的问题。
  if (allowMipMap && isPowerOf2(image.width) && isPowerOf2(image.height)) {
    gl.generateMipmap(gl.TEXTURE_2D); // 如果长宽是二的幂则生成多级渐进纹理（Mipmap）
  } else {
    // 不是二的幂，则不能使用MipMap，这就需要手动设置纹理坐标重复（Texture Coordinate Wrapping）避免纹理坐标越界的问题
    // 水平方向上采用Clamp to Edge
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S, // 水平方向
      gl.CLAMP_TO_EDGE
    );
    // 垂直方向上采用Clamp to Edge
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T, // 垂直方向
      gl.CLAMP_TO_EDGE
    );
    // 定义最小化滤波器类型。当纹理被放大时，将使用线性滤波来计算像素颜色。
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER, // 定义最小化滤波器
      gl.LINEAR
    );
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

export function createEmptyTexture(
  gl: WebGLRenderingContext,
  width: number,
  height: number
) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

// 将顶点坐标缓冲与实际的属性绑定，告诉WebGL如何读取坐标
function setPositionAttribute(
  gl: WebGLRenderingContext,
  buffers: Buffers,
  programInfo: WebGLProgramInfo
) {
  const numComponents = 2; // 每个顶点具有两个组件（x，y），即每个顶点从数组中取出两个值
  const type = gl.FLOAT; // 顶点的数据类型是32为浮点数
  const normalize = false; // 这表示不对顶点数据进行归一化处理。归一化通常用于将数据范围从[-1, 1]或[0, 1]映射到浮点数的表示范围。
  const stride = 0; // 这指定了从一组顶点属性到下一组顶点属性之间的字节数。
  // 注：如果设置为0，WebGL会根据numComponents和type自动计算步长。
  const offset = 0; // 这指定了从顶点缓冲区的哪个位置开始读取顶点数据。0表示从起始位置读取。
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position); //绑定顶点缓冲区到gl.ARRAY_BUFFER
  /* 告诉WebGL如何从当前绑定的ARRAY_BUFFER中读取顶点属性数据。
    参数包括：
      programInfo.attribLocations.vertexPosition：顶点位置属性在顶点着色器中的位置。
      numComponents：每个顶点属性的组件数。
      type：顶点属性的数据类型。
      normalize：是否进行归一化。
      stride和offset：数据在缓冲区中的布局。 
    */
  gl.vertexAttribPointer(
    programInfo.attribLocations.vertexPosition,
    numComponents,
    type,
    normalize,
    stride,
    offset
  );
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition); //启用顶点属性数组，这样WebGL就可以使用上面设置的顶点属性数据进行渲染
}

// 将纹理坐标与实际的属性绑定。告诉 WebGL 如何从缓冲区中提取纹理坐标
function setTextureCoordAttribute(
  gl: WebGLRenderingContext,
  buffers: Buffers,
  programInfo: WebGLProgramInfo
) {
  const num = 2; // 每个坐标由 2 个值组成
  const type = gl.FLOAT; // 缓冲区中的数据为 32 位浮点数
  const normalize = false; // 不做标准化处理
  const stride = 0; // 从一个坐标到下一个坐标要获取多少字节
  const offset = 0; // 从缓冲区内的第几个字节开始获取数据
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
  gl.vertexAttribPointer(
    programInfo.attribLocations.textureCoord,
    num,
    type,
    normalize,
    stride,
    offset
  );
  gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
}

function setMaskPositionAttribute(
  gl: WebGLRenderingContext,
  maskVertexBuffer: WebGLBuffer,
  programInfo: WebGLProgramInfo
) {
  gl.bindBuffer(gl.ARRAY_BUFFER, maskVertexBuffer);
  gl.vertexAttribPointer(
    programInfo.attribLocations.vertexPosition,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
}

function drawTexturedQuad(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  programInfo: WebGLProgramInfo,
  texture: WebGLTexture | null,
  buffers: Buffers
) {
  //不进行变换，显示原本的状态
  const projectionMatrix = mat4.create(); //创建一个4x4空矩阵，用于存储透视投影的结果
  const modelViewMatrix = mat4.create();
  //mat4.scale(modelViewMatrix, modelViewMatrix, [1, -1, 1]); // 从模型上实现垂直翻转（顶点和纹理的对应不变，防止重投影出问题）

  //一系列读取缓冲的函数，其实他的核心步骤都是，告诉WebGL如何从一个一维数组中读取出各个顶点需要的属性，并告诉他要把这些属性传递到什么地方。
  // 告诉WebGL如何从顶点缓冲区中获取顶点，并将顶点存入programInfo里的vertexPosition属性中
  setPositionAttribute(gl, buffers, programInfo);
  //设置颜色
  //setColorAttribute(gl, buffers, programInfo);
  //设置纹理坐标属性
  setTextureCoordAttribute(gl, buffers, programInfo);

  // 告知WebGL使用我们的ShaderProgram进行渲染
  gl.useProgram(programInfo.program);

  //设置统一状态（Uniform state）
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  ); //设置模型变换矩阵
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.modelViewMatrix,
    false,
    modelViewMatrix
  );

  // 处理纹理
  // Tell WebGL we want to affect texture unit 0
  gl.activeTexture(gl.TEXTURE0);
  // Bind the texture to texture unit 0
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 设置纹理采样器统一状态
  // Tell the shader we bound the texture to texture unit 0
  gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

  //使用渲染命令绘制图形
  {
    const offset = 0;
    const vertexCount = vertexRowNum * 2; //顶点数目
    gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount); //TRIANGLE_STRIP模式下，上个三角形的一条边和下一个点组成新的三角形。
  }
}

// 绘制完整场景
function drawScene(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  programInfo: WebGLProgramInfo,
  texture: WebGLTexture | null,
  buffers: Buffers
) {
  //如果canvas类型不是HTMLCanvasElement则报错并返回
  if (!("clientWidth" in gl.canvas)) {
    alert("canvas 类型有误");
    return;
  }

  gl.disable(gl.STENCIL_TEST);
  gl.stencilMask(0xff);
  gl.colorMask(true, true, true, true);
  gl.clearColor(0.0, 0.0, 0.0, 0.0); // 设置清除颜色为透明
  gl.clearDepth(1.0); // 设置清除深度为1.0
  gl.enable(gl.DEPTH_TEST); // 开启深度检测
  gl.depthFunc(gl.LEQUAL); // 深度检测方法为近的东西遮盖远的东西

  // 清除画布，这里清除了颜色的缓冲和深度的缓冲
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
  maskVertices: Float32Array
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
    // 第一段：三角化后的 TileClipArea 只写入 stencil，不写颜色。
    gl.bindBuffer(gl.ARRAY_BUFFER, maskVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, maskVertices, gl.STATIC_DRAW);
    gl.useProgram(maskProgramInfo.program);
    setMaskPositionAttribute(gl, maskVertexBuffer, maskProgramInfo);

    const projectionMatrix = mat4.create();
    const modelViewMatrix = mat4.create();
    gl.uniformMatrix4fv(
      maskProgramInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix
    );
    gl.uniformMatrix4fv(
      maskProgramInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix
    );

    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
    gl.drawArrays(gl.TRIANGLES, 0, maskVertexCount);

    // 第二段：只在 stencil 内绘制重投影后的瓦片纹理。
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

// 绘制场景
function drawSceneClipped(
  gl: WebGLRenderingContext,
  vertexRowNum: number,
  programInfo: WebGLProgramInfo,
  texture: WebGLTexture | null,
  buffers: Buffers,
  polygonVertices: Array<number>,
  options: { clear?: boolean } = {}
) {
  //如果canvas类型不是HTMLCanvasElement则报错并返回
  if (!("clientWidth" in gl.canvas)) {
    alert("canvas 类型有误");
    return;
  }

  gl.clearColor(0.0, 0.0, 0.0, 0.0); // 设置清除颜色为透明
  gl.clearDepth(1.0); // 设置清除深度为1.0
  gl.enable(gl.DEPTH_TEST); // 开启深度检测
  gl.depthFunc(gl.LEQUAL); // 深度检测方法为近的东西遮盖远的东西

  // 多 polygon 合并绘制时只在第一轮清屏，后续轮次叠加到同一 FBO。
  if (options.clear ?? true) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  //不进行变换，显示原本的状态
  const projectionMatrix = mat4.create(); //创建一个4x4空矩阵，用于存储透视投影的结果
  const modelViewMatrix = mat4.create();
  //mat4.scale(modelViewMatrix, modelViewMatrix, [1, -1, 1]); // 从模型上实现垂直翻转（顶点和纹理的对应不变，防止重投影出问题）

  //一系列读取缓冲的函数，其实他的核心步骤都是，告诉WebGL如何从一个一维数组中读取出各个顶点需要的属性，并告诉他要把这些属性传递到什么地方。
  // 告诉WebGL如何从顶点缓冲区中获取顶点，并将顶点存入programInfo里的vertexPosition属性中
  setPositionAttribute(gl, buffers, programInfo);
  //设置颜色
  //setColorAttribute(gl, buffers, programInfo);
  //设置纹理坐标属性
  setTextureCoordAttribute(gl, buffers, programInfo);

  // 告知WebGL使用我们的ShaderProgram进行渲染
  gl.useProgram(programInfo.program);

  //设置统一状态（Uniform state）
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.projectionMatrix,
    false,
    projectionMatrix
  ); //设置模型变换矩阵
  gl.uniformMatrix4fv(
    programInfo.uniformLocations.modelViewMatrix,
    false,
    modelViewMatrix
  );

  // Tell WebGL we want to affect texture unit 0
  gl.activeTexture(gl.TEXTURE0);
  // Bind the texture to texture unit 0
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Tell the shader we bound the texture to texture unit 0
  gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

  // 处理裁剪多边形
  gl.uniform1iv(
    programInfo.uniformLocations.polygonVerticesCount,
    new Int32Array([polygonVertices.length / 2]) // 片段着色器里读取时就组合成vec2了，所以长度要除以2
  );
  gl.uniform2fv(
    programInfo.uniformLocations.polygonVertices,
    new Float32Array(polygonVertices)
  );

  //使用渲染命令绘制图形
  {
    const offset = 0;
    const vertexCount = vertexRowNum * 2; //顶点数目
    gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount); //TRIANGLE_STRIP模式下，上个三角形的一条边和下一个点组成新的三角形。
  }
}

export { drawScene, drawSceneClipped, drawSceneMasked };
