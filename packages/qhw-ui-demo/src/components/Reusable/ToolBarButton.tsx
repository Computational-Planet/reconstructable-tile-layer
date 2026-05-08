import React, { useState } from "react";
import clsx from "clsx";
import "./index.css";
type ToolBarButtonProps = {
  style?: React.CSSProperties;
  className?: string;
  active?: boolean;
  onActive?: () => void;
  onClose?: () => void;
  icon?: React.ReactNode; // 一个ReactNode类型的icon
  title?: string;
};

export const ToolBarButton = (props: ToolBarButtonProps) => {
  const {
    style: userStyle,
    className,
    active: controlledActive,
    onActive,
    onClose,
    icon,
    title,
  } = props;

  const [innerActive, setInnerActive] = useState<boolean>(false);
  const active = controlledActive ?? innerActive;
  const setActive = (value: boolean) => {
    if (controlledActive === undefined) {
      setInnerActive(value);
    }
  };

  return active ? (
    <span
      style={{ ...userStyle }}
      className={clsx("toolbar-button", "toolbar-button-active", className)}
      title={title}
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
      title={title}
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
