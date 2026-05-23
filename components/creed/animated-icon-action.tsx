"use client";

import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  useAnimatedIconControls,
  type AnimatedIconHandle,
} from "@/components/creed/animated-icon-controls";

type AnimatedIconComponent = ComponentType<{
  ref?: Ref<AnimatedIconHandle>;
  size?: number;
  className?: string;
}>;

export function AnimatedIconButton({
  icon: Icon,
  iconSize = 16,
  iconClassName = "inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none",
  showIcon = true,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  icon: AnimatedIconComponent;
  iconSize?: number;
  iconClassName?: string;
  showIcon?: boolean;
  children: ReactNode;
}) {
  const { iconRef, start, settle } = useAnimatedIconControls();

  return (
    <Button
      {...props}
      onMouseEnter={(event) => {
        start();
        props.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        settle();
        props.onMouseLeave?.(event);
      }}
    >
      {showIcon ? <Icon ref={iconRef} size={iconSize} className={iconClassName} /> : null}
      {children}
    </Button>
  );
}

export function AnimatedMenuIconItem({
  icon: Icon,
  iconSize = 14,
  iconClassName = "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none",
  showIcon = true,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuItem> & {
  icon: AnimatedIconComponent;
  iconSize?: number;
  iconClassName?: string;
  showIcon?: boolean;
  children: ReactNode;
}) {
  const { iconRef, start, settle } = useAnimatedIconControls();

  return (
    <DropdownMenuItem
      {...props}
      onMouseEnter={(event) => {
        start();
        props.onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        settle();
        props.onMouseLeave?.(event);
      }}
    >
      {showIcon ? <Icon ref={iconRef} size={iconSize} className={iconClassName} /> : null}
      {children}
    </DropdownMenuItem>
  );
}
