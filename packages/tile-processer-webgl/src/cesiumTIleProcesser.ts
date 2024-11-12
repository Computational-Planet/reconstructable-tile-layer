import { ImageryProvider, ImageryTypes } from "cesium";
import { clipFS, defaultFS, defaultVS } from "./shader/defaultShaders";
import {
  drawScene,
  drawSceneClipped,
  generateTexture,
  initPositionBuffer,
  initShaderProgram,
  initTextureCoordBuffer,
} from "./glInitFunc";

class CachedPromise<T> {
  private cacheMap = new Map<string, Promise<T>>();

  get(key: string, promiseFn?: () => Promise<T>): Promise<T> | undefined {
    if (!this.cacheMap.has(key) && promiseFn) {
      this.set(key, promiseFn());
    }
    return this.cacheMap.get(key);
  }

  set(key: string, promise: Promise<T>): void {
    this.cacheMap.set(key, promise);
  }

  delete(key: string): void {
    this.cacheMap.delete(key);
  }

  clear(): void {
    this.cacheMap.clear();
  }
}

/**
 * 获取指定瓦片，并使用WebGL进行重投影，随后输出处理后的影像的类。
 */
export class CesiumTileProcesser {
  private _canvas: HTMLCanvasElement;
  private _context: WebGLRenderingContext | null;
  //vsSource?: string; // 顶点着色器
  //fsSource?: string; // 片段着色器
  private _programInfo: {
    defaultProgramInfo: WebGLProgramInfo;
    clipProgramInfo: WebGLProgramInfo;
  };
  private _buffers: Buffers;
  private _vertexRowNum: number = 64;
  private _currentTileXYZ: { x: number; y: number; z: number } | undefined =
    undefined; // 当前处理的瓦片xyz
  private _currentResult: string | null = null;
  private _imageCachePromise = new CachedPromise<ImageryTypes>();
  private _imageBuffer: { [key: string]: ImageryTypes | undefined } = {}

  constructor(canvas: HTMLCanvasElement, options: CesiumTileProcesserOptions) {
    // 获取画布
    this._canvas = canvas;
    // 设置宽高
    this._canvas.width = options.width ?? 256;
    this._canvas.height = options.height ?? 256;

    //获取webgl上下文(需要允许透明)
    this._context = this._canvas.getContext("webgl", { alpha: true });
    // 确认WebGL支持性
    if (!this._context) {
      throw new Error(
        "无法初始化WebGl，你的浏览器、操作系统或硬件可能不支持WebGL"
      );
    }
    // 设置清除颜色为透明
    this._context.clearColor(0.0, 0.0, 0.0, 0.0);
    // 使用清除颜色清空颜色缓冲区
    this._context.clear(this._context.COLOR_BUFFER_BIT);

    // 初始化shader
    const vsSource = options.vsSource ?? defaultVS; // 引入顶点着色器，若未定义则使用默认值。
    const fsSource = options.fsSource ?? defaultFS; // 引入片段着色器，若未定义则使用默认值。
    // 初始化裁剪FS
    const fsSourceClip = options.fsSource ?? clipFS; // 引入多边形裁剪片段着色器，若未定义则使用默认值。

    // 初始化着色器程序
    const defaultShaderProgram = initShaderProgram(
      this._context,
      vsSource,
      fsSource
    );
    const clipShaderProgram = initShaderProgram(
      this._context,
      vsSource,
      fsSourceClip
    );
    if (!defaultShaderProgram || !clipShaderProgram) {
      throw new Error("初始化着色器程序失败");
    }
    // 注意，uniform和attribute等变量的声明是在着色器程序那边定义的。在上一步加载、编译、初始化着色器的过程中，这些变量的声明其实已经完成了。虽然还没有实际的值，但是我们已经可以获取指针。这里获取的其实就是指向这些变量的指针。
    //初始化程序信息
    this._programInfo = {
      // 默认着色器信息，只负责重投影，不裁剪
      defaultProgramInfo: {
        program: defaultShaderProgram, // 着色器程序
        attribLocations: {
          //attribLocations存放属性
          vertexPosition: this._context.getAttribLocation(
            defaultShaderProgram,
            "aVertexPosition" // 这个变量的定义是在glsl的代码中，我们在这里只是获取了其指针
          ),
          //vertexColor: this.context.getAttribLocation(shaderProgram, "aVertexColor"),
          textureCoord: this._context.getAttribLocation(
            defaultShaderProgram,
            "aTextureCoord"
          ),
        },
        uniformLocations: {
          //uniformLocations存放Uniform
          projectionMatrix: this._context.getUniformLocation(
            defaultShaderProgram,
            "uProjectionMatrix" // 这个变量的定义是在glsl的代码中，我们在这里只是获取了其指针
          ),
          modelViewMatrix: this._context.getUniformLocation(
            defaultShaderProgram,
            "uModelViewMatrix" // 这个变量的定义是在glsl的代码中，我们在这里只是获取了其指针
          ),
          uSampler: this._context.getUniformLocation(
            defaultShaderProgram,
            "uSampler"
          ), //纹理的采样器，也是Uniform
        },
      },
      // 裁剪着色器信息，负责重投影和裁剪，需要额外传入多边形坐标和顶点数目
      clipProgramInfo: {
        program: clipShaderProgram, // 着色器程序
        attribLocations: {
          //attribLocations存放属性
          vertexPosition: this._context.getAttribLocation(
            clipShaderProgram,
            "aVertexPosition" // 这个变量的定义是在glsl的代码中，我们在这里只是获取了其指针
          ),
          //vertexColor: this.context.getAttribLocation(shaderProgram, "aVertexColor"),
          textureCoord: this._context.getAttribLocation(
            clipShaderProgram,
            "aTextureCoord"
          ),
        },
        uniformLocations: {
          //uniformLocations存放Uniform
          projectionMatrix: this._context.getUniformLocation(
            clipShaderProgram,
            "uProjectionMatrix" // 这个变量的定义是在glsl的代码中，我们在这里只是获取了其指针
          ),
          modelViewMatrix: this._context.getUniformLocation(
            clipShaderProgram,
            "uModelViewMatrix" // 这个变量的定义是在glsl的代码中，我们在这里只是获取了其指针
          ),
          uSampler: this._context.getUniformLocation(
            clipShaderProgram,
            "uSampler"
          ), //纹理的采样器，也是Uniform
          polygonVerticesCount: this._context.getUniformLocation(
            clipShaderProgram,
            "polygonVerticesCount"
          ), // 多边形的顶点个数（需要小于1000个）
          polygonVertices: this._context.getUniformLocation(
            clipShaderProgram,
            "polygonVertices"
          ), // 多边形的顶点数组（需要首尾相同）
        },
      },
    };

    // 初始化顶点缓冲区（纹理缓冲区之后需要在绘制时实时处理）
    // 初始化顶点行数（默认每幅图使用64*2个顶点）
    this._vertexRowNum = options.vertexRowNum ?? 64;
    //初始化buffers
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
  get currentTileXYZ() {
    return this._currentTileXYZ;
  }
  get currentResult() {
    return this._currentResult;
  }

  // 产出重投影的结果
  async reprojectTile(x: number, y: number, level: number, provider: ImageryProvider) {
    if (this._context == null) {
      console.error("gl上下文未正确定义");
      return null;
    }

    // 根据瓦片具体位置初始化纹理坐标
    this._buffers.textureCoord = initTextureCoordBuffer(
      this._context,
      this._vertexRowNum,
      provider,
      x,
      y,
      level
    );

    // 加载瓦片
    const tileKey = `${x}-${y}-${level}`;

    try {
      if (!this._imageBuffer[tileKey]) {
        const image = await this._imageCachePromise.get(tileKey, () => provider.requestImage(x, y, level)!);
        if (!image) {
          console.error("图像获取失败");
          return null;
        }
        this._imageBuffer[tileKey] = image;
      }

      //将瓦片转换成纹理
      const texture = generateTexture(this._context, this._imageBuffer[tileKey]);

      drawScene(
        this._context,
        this._vertexRowNum,
        this._programInfo.defaultProgramInfo,
        texture,
        this._buffers
      );

      this._currentResult = this._canvas.toDataURL();
      return this._currentResult;
    } catch (error) {
      console.error("获取或处理图像时发生错误:", error);
      return null;
    } finally {
      this._imageCachePromise.delete(tileKey);
    }
  }

  // 产出经过裁剪的重投影瓦片（部分透明），需要输入顶点坐标，坐标是相对于纹理坐标定义的(0-1)
  async reprojectClippedTile(
    x: number,
    y: number,
    level: number,
    polygonVertices: Array<number>,
    provider: ImageryProvider
  ) {
    if (this._context == null) {
      console.error("gl上下文未正确定义");
      return null;
    }
    // 根据瓦片具体位置初始化纹理坐标
    this._buffers.textureCoord = initTextureCoordBuffer(
      this._context,
      this._vertexRowNum,
      provider,
      x,
      y,
      level
    );

    // 加载瓦片
    const tileKey = `${x}-${y}-${level}`;
    try {
      if (!this._imageBuffer[tileKey]) {
        const image = await this._imageCachePromise.get(tileKey, () => provider.requestImage(x, y, level)!);
        if (!image) {
          console.error("图像获取失败");
          return null;
        }
        this._imageBuffer[tileKey] = image;
      }



      //将瓦片转换成纹理
      const texture = generateTexture(this._context, this._imageBuffer[tileKey]);

      drawSceneClipped(
        this._context,
        this._vertexRowNum,
        this._programInfo.clipProgramInfo,
        texture,
        this._buffers,
        polygonVertices
      );

      this._currentResult = this._canvas.toDataURL();
      return this._currentResult;

    } catch (error) {
      console.error("获取或处理图像时发生错误:", error);
      return null;
    } finally {
      this._imageCachePromise.delete(tileKey);
    }
  }

  clearBuffer() {
    this._imageBuffer = {};
    this._imageCachePromise.clear();
  }
}

// 输出类的选项
export type CesiumTileProcesserOptions = {
  width?: number; // 瓦片宽度
  height?: number; // 瓦片高度
  vsSource?: string; // 顶点着色器
  fsSource?: string; // 片段着色器
  vertexRowNum?: number; //顶点行数

  // tileX: number;
  // tileY: number;
  // tileZ: number;
};

//TS中需要定义该变量的类型（没有预定义）
export type WebGLProgramInfo = {
  // 着色器程序(shaderProgram)
  program: WebGLProgram;
  // 所有传入着色器的属性(attribute)
  attribLocations: {
    [key: string]: number; // 顶点着色器传入属性的位置值
    /* vertexPosition: number;
    vertexColor: number;
    textureCoord: number; */
  };
  // 所有传入着色器的统一状态(uniform state)
  uniformLocations: {
    [key: string]: WebGLUniformLocation | null; // 统一状态的位置
    /* projectionMatrix: WebGLUniformLocation | null;
    modelViewMatrix: WebGLUniformLocation | null;
    uSampler: WebGLUniformLocation | null; */
  };
};

// 缓冲区的类型
export type Buffers = {
  [key: string]: WebGLBuffer | null; // 缓冲区
  /*   position: WebGLBuffer | null; // 顶点位置缓冲区
  textureCoord: WebGLBuffer | null; // 纹理坐标缓冲区 */
};