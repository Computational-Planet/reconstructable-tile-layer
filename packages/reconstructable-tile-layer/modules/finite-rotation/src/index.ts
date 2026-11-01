export {
  RotationOperator,
  RotationOperator as FiniteRotationInterpolator,
} from "./RotationOperator.js";
export type {
  RotationOperatorOptions,
  RotationOperatorOptions as FiniteRotationInterpolatorOptions,
} from "./RotationOperator.js";
export {
  convertFileContentToJson,
  convertFileContentToJson as parseFiniteRotationText,
  createQuaternionFromRotation,
  createQuaternionFromRotation as createFiniteRotationQuaternion,
} from "./handleRot.js";
export {
  getQuaternionAtAge,
  getQuaternionAtAge as interpolateFiniteRotationAtAge,
} from "./getQuaternionAtAge.js";
export type { AnchorPlateId } from "./getQuaternionAtAge.js";
export {
  getInverseRotateMatrixAtAge,
  getInverseRotateMatrixAtAge as getInversePlateRotationMatrixAtAge,
  getPositionsAtAge,
  getRotateMatirxAtAge,
  getRotateMatirxAtAge as getRotateMatrixAtAge,
  getRotateMatirxAtAge as getPlateRotationMatrixAtAge,
  rotateCartensianPoint,
  rotateCartensianPoint as rotateCartesianPoint,
  rotatePoints,
  rotatePointToModern,
} from "./rotate.js";
export type {
  RotItem,
  RotItem as FiniteRotationRecord,
  RotSplineItem,
  RotSplineItem as FiniteRotationSeries,
} from "./types.js";
