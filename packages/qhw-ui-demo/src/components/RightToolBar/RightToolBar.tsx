import React, { useState } from "react";
import clsx from "clsx";
import { CSSProperties } from "react";

import "./index.css";
import { ToolBarButton } from "../Reusable";
import { ControlOutlined } from "@ant-design/icons";

type RightToolBarProps = {
  style?: CSSProperties;
  className?: string;
  children?: React.ReactNode;
};

export const RightToolBar = (props: RightToolBarProps) => {
  const { style: userStyle, className, children } = props;

  const [expand, setExpand] = useState<boolean>(false);

  return (
    <div style={{ ...userStyle }} className={clsx("right-toolbar", className)}>
      <div
        style={{
          margin: 0,
          padding: 0,
          transform: `translate(0,${expand ? "0" : "30%"})`,
          opacity: `${expand ? "1" : "0"}`,
          pointerEvents: `${expand ? "all" : "none"}`,
          transition: "all 0.2s ease-in-out",
        }}
      >
        {children}
      </div>
      <ToolBarButton
        style={{ zIndex: 1 }}
        icon={<ControlOutlined />}
        onActive={() => {
          setExpand(true);
        }}
        onClose={() => {
          setExpand(false);
        }}
      ></ToolBarButton>
    </div>
  );
}

