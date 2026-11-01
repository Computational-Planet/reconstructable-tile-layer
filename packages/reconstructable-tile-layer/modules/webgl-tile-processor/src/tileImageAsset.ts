import { isCanvasElement } from "./canvas.js";
import type { TileImageAsset, TileImageOutputType } from "./types.js";

export class RetainedTileImageAsset implements TileImageAsset {
  private _referenceCount = 0;
  private _released = false;

  constructor(
    readonly source: string | HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
    readonly kind: TileImageOutputType,
  ) {}

  retain() {
    if (this._released) {
      throw new Error("无法复用已经释放的瓦片图像资源");
    }
    this._referenceCount++;
    return this;
  }

  release = () => {
    if (this._referenceCount <= 0) {
      return;
    }
    this._referenceCount--;
    if (this._referenceCount === 0) {
      this.dispose();
    }
  };

  private dispose() {
    if (this._released) {
      return;
    }
    this._released = true;
    if (this.kind === "blobUrl" && typeof this.source === "string" && typeof URL !== "undefined") {
      URL.revokeObjectURL(this.source);
    }
    if (this.kind === "canvas" && isCanvasElement(this.source)) {
      this.source.width = 0;
      this.source.height = 0;
    }
  }
}
