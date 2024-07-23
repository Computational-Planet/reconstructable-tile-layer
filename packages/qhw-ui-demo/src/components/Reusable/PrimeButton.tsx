import React from "react";
import clsx from "clsx";
import "./index.css";
type ButtonProps = {
  level?: "prime" | "secondary";
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
};

function Button(props: ButtonProps) {
  const {
    level = "prime",
    style: userStyle,
    className,
    onClick,
    children,
  } = props;

  return (
    <span
      style={{ ...userStyle }}
      className={
        level === "prime"
          ? clsx("prime-button", className)
          : clsx("secondary-button", className)
      }
      onClick={onClick}
    >
      {children}
    </span>
  );
}

export default Button;
