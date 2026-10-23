// Reprojects EPSG:3857 texture coordinates onto a tile-local [0, 1] mesh.
export const defaultVS: string = /* glsl */ `
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying highp vec2 vTextureCoord;
varying highp vec2 vVertexCoord;

void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * (aVertexPosition*2.0-1.0);
  vTextureCoord = aTextureCoord;
  vVertexCoord = aVertexPosition.xy;
}
`;

export const defaultFS: string = /* glsl */ `
varying highp vec2 vTextureCoord;
uniform sampler2D uSampler;

void main() {
  gl_FragColor = texture2D(uSampler, vTextureCoord);
}
`;

// The mask program writes triangulated clip areas into the stencil buffer.
export const maskVS: string = /* glsl */ `
attribute vec2 aVertexPosition;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const maskFS: string = /* glsl */ `
precision highp float;

void main() {
  gl_FragColor = vec4(1.0);
}
`;

export const clipFS: string = /* glsl */ `
precision highp float;
varying highp vec2 vTextureCoord;
varying highp vec2 vVertexCoord;
uniform sampler2D uSampler;
uniform vec2 polygonVertices[1000];
uniform int polygonVerticesCount;

bool isPointInPolygon(vec2 point) {
  float x = point.x;
  float y = point.y;
  float k=0.0;
  float b=0.0;
  int count = 0;
  for (int i = 0; i < 1000; i++) {
    if(i == polygonVerticesCount-1) break;
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
  if (!isPointInPolygon(vVertexCoord)) {
    discard;
  }
  gl_FragColor = texture2D(uSampler, vTextureCoord);
}
`;
