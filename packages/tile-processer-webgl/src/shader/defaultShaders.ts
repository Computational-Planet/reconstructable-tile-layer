export const defaultVS: string = /*glsl*/ `
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;//定义纹理坐标属性

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying highp vec2 vTextureCoord;//定义纹理位置变量，将纹理的位置传给片段着色器

void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * (aVertexPosition*2.0-1.0);
  vTextureCoord = aTextureCoord;
}
`;
export const defaultFS: string = /*glsl*/ `
varying highp vec2 vTextureCoord;
uniform sampler2D uSampler;

void main() {
  gl_FragColor = texture2D(uSampler, vTextureCoord);
}
`;

export const clipFS: string = /*glsl*/ `
precision highp float;
varying highp vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 polygonVertices[1000]; // 假设多边形最多有1000个顶点
uniform int polygonVerticesCount; // 多边形顶点的数量

// 射线法判断点和多边形的位置关系
bool isPointInPolygon(vec2 point) {
  float x = point.x;
  float y = point.y;
  float k=0.0;
  float b=0.0;
  int count = 0;
  for (int i = 0; i < 1000; i++) {
    // 遍历完每条边后break;
    if(i == polygonVerticesCount-1) break;
    // 当两点分布在该点左右时才有可能有交点
    if ((polygonVertices[i+1].x - x) * (polygonVertices[i].x - x) <= 0.0 && max(polygonVertices[i+1].x, polygonVertices[i].x) != x){
      k = (1.0 * (polygonVertices[i+1].y - polygonVertices[i].y)) / (1.0*(polygonVertices[i+1].x - polygonVertices[i].x));
			b = 1.0 * polygonVertices[i+1].y - k * polygonVertices[i+1].x;
			if (k * x + b > y)
				count++;
    }
  }
  if(count / 2 == (count+1) / 2) return false;
  return true;
}

void main() {
  if (!isPointInPolygon(vTextureCoord)) {
    discard; // 如果片段不在多边形内，则丢弃该片段
  }
  gl_FragColor = texture2D(uSampler, vTextureCoord);
}
`;
