import { Cartesian3, Quaternion, QuaternionSpline, Math as CMath } from "cesium";
import { convertFileContentToJson } from "./handleRot";
import {
  getInverseRotateMatrixAtAge,
  getRotateMatirxAtAge,
  rotatePointToModern,
} from "./rotate";

export type RotItem = {
  plateId: string;
  age: number;
  rotation: {
    latitude: number;
    longitude: number;
    angle: number;
  };
  relatedId: string;
};

export type RotSplineItem = {
  spline?: QuaternionSpline;
  items: RotItem[];
};

export class RotationOperator {
  rotData: Map<string, RotSplineItem> = new Map<string, RotSplineItem>()
  private _ready: boolean = false

  constructor() {
  }

  get ready() {
    return this._ready;
  }

  async init(urls: string[]) {
    this._ready = false;
    await this.handleRot(urls); // 读取旋转文件
    this._ready = true; // 设置状态为准备完毕
  }
  async handleRot(urls: string[]) {
    const contents = await Promise.all(
      urls.map(async (rotUrl) => {
        return (await fetch(rotUrl)).text();
      }),
    ); // 将每个rot文件都读取为string类型，得到string[]
    const rot = convertFileContentToJson(contents.join("\n")); // 将几个rot文件全部合并到一个长字符串中
    // 开始处理长字符串
    Object.entries(rot).map(([key, value]) => {
      const items = [...value];
      if (items.length === 0) return;

      const times = items.map((item) => item.age);
      const points = items.map(this.createQuaternionFromRotation);

      const spline =
        times.length > 1
          ? new QuaternionSpline({
            times,
            points,
          })
          : undefined;
      this.rotData.set(key, {
        spline,
        items,
      })
    });
  }

  createQuaternionFromRotation(item: RotItem): Quaternion {
    return Quaternion.fromAxisAngle(
      Cartesian3.fromDegrees(item.rotation.longitude, item.rotation.latitude),
      CMath.toRadians(item.rotation.angle),
    );
  }

  async getRotateMatrix(plateId: string, age: number) {
    return getRotateMatirxAtAge(plateId, this.rotData, age);
  }

  async getInverseRotateMatrix(plateId: string, age: number) {
    return getInverseRotateMatrixAtAge(plateId, this.rotData, age);
  }

  async rotatePointToModern(point: Cartesian3, plateId: string, age: number) {
    return rotatePointToModern(point, plateId, this.rotData, age);
  }
}
