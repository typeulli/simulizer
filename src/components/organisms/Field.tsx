import React from "react";
import { token } from "@/components/tokens";
import { Text } from "@/components/atoms/Text";
import { Input, Textarea, Select, type InputSize } from "@/components/atoms/Input";

export interface FieldProps {
  label?: string;
  help?: string;
  error?: string;
  required?: boolean;
  size?: InputSize;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Field({ label, help, error, required, size, children, style }: FieldProps) {
  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           token.space.sp15,
        ...style,
      }}
    >
      {label && (
        <Text
          variant="caption"
          tone="muted"
          as="label"
          style={{ fontWeight: token.font.weight.medium }}
        >
          {label}
          {required && (
            <Text tone="danger" style={{ marginLeft: token.space.spPx }}>*</Text>
          )}
        </Text>
      )}
      {children ?? <Input size={size} invalid={!!error} />}
      {error && <Text variant="caption" tone="danger">{error}</Text>}
      {help && !error && <Text variant="caption" tone="subtle">{help}</Text>}
    </div>
  );
}

export interface InputFieldProps extends FieldProps {
  inputProps?: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>;
}

export function InputField({ inputProps, ...fieldProps }: InputFieldProps) {
  return (
    <Field {...fieldProps}>
      <Input size={fieldProps.size} invalid={!!fieldProps.error} {...inputProps} />
    </Field>
  );
}

export interface TextareaFieldProps extends FieldProps {
  textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
}

export function TextareaField({ textareaProps, ...fieldProps }: TextareaFieldProps) {
  return (
    <Field {...fieldProps}>
      <Textarea size={fieldProps.size} invalid={!!fieldProps.error} {...textareaProps} />
    </Field>
  );
}

export interface SelectFieldProps extends FieldProps {
  selectProps?: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>;
}

export function SelectField({ selectProps, ...fieldProps }: SelectFieldProps) {
  return (
    <Field {...fieldProps}>
      <Select size={fieldProps.size} invalid={!!fieldProps.error} {...selectProps} />
    </Field>
  );
}
