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
