import {
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  ImageryProvider,
  Material,
  Primitive,
  RectangleGeometry,
  Viewer,
} from "cesium";
import CesiumTileProcesser from "tile-processer-webgl";

type TileXYL = { x: number; y: number; level: number };

export class CustomTilePrimitive {
  readonly id: string;
  tileXYL: TileXYL;
  primitive: Primitive | null;
  constructor(
    id: string,
    viewer: Viewer,
    provider: ImageryProvider,
    x: number,
    y: number,
    level: number
  ) {
    this.id = id;
    this.tileXYL = {
      x: x,
      y: y,
      level: level,
    };
    this.primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        id: this.id,
        geometry: new RectangleGeometry({
          rectangle: provider.tilingScheme.tileXYToRectangle(
            this.tileXYL.x,
            this.tileXYL.y,
            this.tileXYL.level
          ),
        }),
      }),
      appearance: new EllipsoidSurfaceAppearance({
        //aboveGround: true,
        material: Material.fromType("Color", {
          color: new Color(0.0, 0.0, 0.0, 0.0),
        }),
      }),
    });
    this.primitive = viewer.scene.primitives.add(this.primitive);
    //viewer.scene.primitives.raiseToTop(this.primitive); // 貌似无效
  }

  get shown(): Boolean {
    if (this.primitive) {
      return this.primitive.show;
    } else return false;
  }

  set shown(val: boolean) {
    if (this.primitive) this.primitive.show = val;
  }

  destroy(viewer: Viewer) {
    viewer.scene.primitives.remove(this.primitive);
    this.primitive = null;
  }
}

export class CustomTileManager {
  tilePrimitives: { [key: string]: CustomTilePrimitive };
  viewer: Viewer;

  constructor(viewer: Viewer) {
    this.tilePrimitives = {};
    this.viewer = viewer;
  }

  async generateOriTile(
    id: string,
    provider: ImageryProvider,
    x: number,
    y: number,
    level: number,
    canvas: HTMLCanvasElement
  ) {
    // console.log(id);
    if (this.tilePrimitives.hasOwnProperty(id)) {
      // console.log(this.tilePrimitives[id]);
      return;
    }
    const tileItem = new CustomTilePrimitive(
      id,
      this.viewer,
      provider,
      x,
      y,
      level
    );
    this.tilePrimitives[id] = tileItem;
    provider.requestImage(x, y, level)?.then((img) => {
      // 仅当图元尚存时才进行进一步操作
      if (tileItem.primitive) {
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Can not create canvas");
        }
        //设置工作区宽高
        canvas.width = img.width;
        canvas.height = img.height;

        // 清除画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 保存当前状态
        ctx.save();
        // 在Y轴（垂直轴）方向缩放-1，上下翻转
        ctx.scale(1, -1);
        ctx.drawImage(img, 0, 0, img.width, -img.height);

        //获取图像数据
        const imageURL = canvas.toDataURL();

        tileItem.primitive.appearance.material = new Material({
          fabric: {
            type: "Image",
            uniforms: {
              image: imageURL,
            },
          },
        });
      }
    });
  }
  async generateReprojTile(
    id: string,
    provider: ImageryProvider,
    x: number,
    y: number,
    level: number,
    processer: CesiumTileProcesser
  ) {
    // console.log(id);
    if (this.tilePrimitives.hasOwnProperty(id)) {
      // console.log(this.tilePrimitives[id]);
      return;
    }
    const tileItem = new CustomTilePrimitive(
      id,
      this.viewer,
      provider,
      x,
      y,
      level
    );
    this.tilePrimitives[id] = tileItem;
    const imageURL = await processer.reprojectTile(x, y, level);
    if (tileItem.primitive)
      tileItem.primitive.appearance.material = new Material({
        fabric: {
          type: "Image",
          uniforms: {
            image: imageURL,
          },
        },
      });
  }
  async generateClippedReprojTile(
    id: string,
    provider: ImageryProvider,
    x: number,
    y: number,
    level: number,
    processer: CesiumTileProcesser,
    polygon: Array<number>
  ) {
    // console.log(id);
    if (this.tilePrimitives.hasOwnProperty(id)) {
      // console.log(this.tilePrimitives[id]);
      return;
    }
    const tileItem = new CustomTilePrimitive(
      id,
      this.viewer,
      provider,
      x,
      y,
      level
    );
    this.tilePrimitives[id] = tileItem;
    const imageURL = await processer.reprojectClippedTile(x, y, level, polygon);
    if (tileItem.primitive)
      tileItem.primitive.appearance.material = new Material({
        fabric: {
          type: "Image",
          uniforms: {
            image: imageURL,
          },
        },
      });
  }
  getById(id: string) {
    return this.tilePrimitives[id];
  }
  removeById(id: string) {
    if (this.tilePrimitives[id]) {
      // console.log(this.tilePrimitives[id]);
      this.tilePrimitives[id].destroy(this.viewer);
      delete this.tilePrimitives[id];
    }
  }
  removeAll() {
    for (let id in this.tilePrimitives) {
      this.tilePrimitives[id]?.destroy(this.viewer);
      delete this.tilePrimitives[id];
    }
  }
}
