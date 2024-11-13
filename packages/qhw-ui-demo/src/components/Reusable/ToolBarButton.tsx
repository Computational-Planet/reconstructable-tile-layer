import React, { useState } from "react";
import clsx from "clsx";
import "./index.css";
type ToolBarButtonProps = {
  style?: React.CSSProperties;
  className?: string;
  onActive?: () => void;
  onClose?: () => void;
  icon?: React.ReactNode; // 一个ReactNode类型的icon
};

export const ToolBarButton = (props: ToolBarButtonProps) => {
  const { style: userStyle, className, onActive, onClose, icon } = props;

  const [active, setActive] = useState<boolean>(false);

  return active ? (
    <span
      style={{ ...userStyle }}
      className={clsx("toolbar-button", "toolbar-button-active", className)}
      onClick={() => {
        // 激活状态下，点击触发关闭方法，并切换状态
        if (onClose) {
          onClose();
        }
        setActive(false);
      }}
    >
      {icon}
    </span>
  ) : (
    <span
      style={{ ...userStyle }}
      className={clsx("toolbar-button", className)}
      onClick={() => {
        // 非激活状态下，点击触发激活方法，并切换状态
        if (onActive) {
          onActive();
        }
        setActive(true);
      }}
    >
      {icon}
    </span>
  );
}

