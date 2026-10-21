import { BlendingState, Color, EllipsoidSurfaceAppearance, Material } from "cesium";

/**
 * Ordered raster surfaces blend in collection order, independently of image
 * alpha. Intended for coincident ellipsoid surfaces, not volumetric geometry.
 */
class OrderedSurfaceAppearance extends EllipsoidSurfaceAppearance {
  override getRenderState() {
    // 不让透明度改变绘制 pass；统一混合且不写深度，才能保持整层叠放顺序。
    return {
      ...this.renderState,
      depthMask: false,
      blending: BlendingState.ALPHA_BLEND,
    };
  }
}

/** Creates the shared surface appearance used by independent raster layers. */
export function createTileSurfaceAppearance(
  image: string | HTMLCanvasElement,
  options: { opacity?: number; ordered?: boolean } = {},
): EllipsoidSurfaceAppearance {
  const material = new Material({
    fabric: {
      type: "Image",
      uniforms: { image, color: Color.WHITE.withAlpha(options.opacity ?? 1) },
    },
    ...(options.ordered ? { translucent: false } : {}),
  });
  const Appearance = options.ordered ? OrderedSurfaceAppearance : EllipsoidSurfaceAppearance;
  return new Appearance({
    flat: true,
    material,
    renderState: { depthTest: { enabled: false } },
  });
}
