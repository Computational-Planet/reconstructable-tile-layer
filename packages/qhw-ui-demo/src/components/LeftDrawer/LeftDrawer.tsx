import React, { useState } from "react";
import clsx from "clsx";
import "./index.css";
import { DoubleLeftOutlined, DoubleRightOutlined } from "@ant-design/icons";

type LeftDrawerProps = {
  style?: React.CSSProperties;
  className?: string;
  //onClose?: () => void;
  children: React.ReactNode;
};

function LeftDrawer(props: LeftDrawerProps) {
  const { style: userStyle, className, children } = props;
  const [open, setOpen] = useState(false);

  return (
    <div style={{ ...userStyle }} className={clsx("left-drawer", className)}>
      <div
        style={{
          display: "flex",
          justifyContent: `${open ? "right" : "left"}`,
          width: "100%",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
          }}
          className={"button-theme-main"}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? (
            <DoubleLeftOutlined
              style={{
                margin: 0,
                fontSize: 15,
              }}
            />
          ) : (
            <DoubleRightOutlined
              style={{
                margin: 0,
                fontSize: 15,
              }}
            />
          )}
        </div>
      </div>
      <div
        style={{
          height: "calc(100% - 80px)",
          boxSizing: "border-box",
          transform: `translate(${open ? "0" : "-30%"},0)`,
          opacity: `${open ? "1" : "0"}`,
          transition: "all 0.2s ease-in-out",
          overflow: "hidden",
          overflowY: "scroll",
          scrollbarWidth: "none",
          marginTop: 20,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default LeftDrawer;
