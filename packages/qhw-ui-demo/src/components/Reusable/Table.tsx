import React from "react";
import clsx from "clsx";
import "./index.css";
type NeatTableProps = {
  style?: React.CSSProperties;
  className?: string;
  head?: Array<any>;
  rowHead?: boolean;
  body: Array<Array<any>>;
  children?: React.ReactNode;
};

function NeatTable(props: NeatTableProps) {
  const {
    style: userStyle,
    className,
    head,
    rowHead = false,
    body,
    children,
  } = props;

  return (
    <table style={{ ...userStyle }} className={clsx("neat-table", className)}>
      {/* 表头部分 */}
      {head && (
        <thead>
          <tr>
            {head.map((item, index) => {
              return <th key={`thead-${index}`}>{item}</th>;
            })}
          </tr>
        </thead>
      )}
      {/* 表主体部分 */}
      <tbody>
        {body.map((row, rowIndex) => {
          return (
            <tr key={`$tbody-${rowIndex}`}>
              {row.map((item, index) => {
                if (index === 0 && rowHead === true)
                  return <th key={`$tbody-${rowIndex}/${index}`}>{item}</th>;
                else return <td key={`$tbody-${rowIndex}/${index}`}>{item}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
      {/* 剩余部分：如果有其他部分则以子元素形式接在后面 */}
      {children}
    </table>
  );
}

export default NeatTable;
