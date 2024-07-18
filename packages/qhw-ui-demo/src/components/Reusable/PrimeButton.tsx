import React from "react";
import clsx from "clsx";
import "./index.css";
type PrimeButtonProps = {
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
};

function PrimeButton(props: PrimeButtonProps) {
  const { style: userStyle, className, onClick, children } = props;

  return (
    <div
      style={{ ...userStyle }}
      className={clsx("prime-button", className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export default PrimeButton;
