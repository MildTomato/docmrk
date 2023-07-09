"use client";

import * as React from "react";

export interface ButtonProps
  // omit `type` as we use it to change type of button
  // replaced with `htmlType`
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  // omit 'disabled' as it is included in HTMLButtonElement
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, ...rest }, ref) => {
    return (
      <button className="bg-green-500 border" ref={ref} {...rest}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
