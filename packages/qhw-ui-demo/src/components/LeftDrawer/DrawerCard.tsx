import React, { useState } from "react";
import clsx from "clsx";
import "./index.css";
import { CaretUpOutlined } from "@ant-design/icons";
type DrawerCardProps = {
  style?: React.CSSProperties;
  className?: string;
  //onClose?: () => void;
  title?: string;
  children?: React.ReactNode;
};

export const DrawerCard = (props: DrawerCardProps) => {
  const { style: userStyle, className, title = undefined, children } = props;
  const [expand, setExpand] = useState(false);

  return (
    <div
      style={{ ...userStyle }}
      className={clsx(
        "drawer-card",
        `${expand && "drawer-card-expand"}`,
        className
      )}
      onClick={() => {
        if (!expand) {
          setExpand(true);
        }
      }}
    >
      <div
        style={{
          margin: 0,
          marginBottom: `${expand ? "10px" : "0px"}`,
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        {title && <h2 style={{ margin: 0, userSelect: "none" }}>{title}</h2>}
        <div
          className={"button-theme-opacity"}
          style={{ margin: 0, width: 30, height: 30 }}
          onClick={() => {
            setExpand(false);
          }}
        >
          {expand ? (
            <CaretUpOutlined style={{ marginBottom: 0, fontSize: 20 }} />
          ) : (
            <div></div>
          )}
        </div>
      </div>
      <div style={{ display: `${expand ? "block" : "none"}`, marginTop: 20 }}>
        {children}
      </div>
    </div>
  );
}

