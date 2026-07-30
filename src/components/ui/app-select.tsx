import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AppSelectOption = {
  value: string;
  label: string;
};

type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly AppSelectOption[];
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
};

const SIZE_CLASSES = {
  sm: "h-8 rounded-lg px-2.5 text-xs",
  default: "h-10 rounded-xl px-3 text-sm",
  lg: "h-12 rounded-xl px-3.5 text-sm",
} as const;

export function AppSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder = "Selecionar",
  disabled,
  required,
  name,
  size = "default",
  className,
}: AppSelectProps) {
  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "border-input bg-background shadow-sm transition-[border-color,box-shadow,background-color] hover:border-brand/40 focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-muted/60",
          SIZE_CLASSES[size],
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="max-h-72 rounded-xl border-border/80 bg-popover p-1 shadow-xl"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="cursor-pointer rounded-lg py-2 pl-3 pr-9 focus:bg-accent focus:text-accent-foreground data-[state=checked]:font-semibold data-[state=checked]:text-brand"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
