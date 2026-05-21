"use client";

import {
  updateFounderProfile,
  updateProfile,
} from "@/lib/actions/profile";
import type {
  UpdateFounderProfileInput,
  UpdateProfileInput,
} from "@/lib/schemas";
import { EditableField } from "./EditableField";
import { EditableTagList } from "./EditableTagList";

/**
 * Thin client-side wrappers that hand a single field's mutation to the right
 * server action, so EditableField/EditableTagList stay generic.
 */
export function ProfileEditableField({
  label,
  value,
  field,
  editable,
  multiline,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  field: keyof UpdateProfileInput;
  editable: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <EditableField
      label={label}
      value={value}
      editable={editable}
      multiline={multiline}
      placeholder={placeholder}
      onSave={async (next) => {
        await updateProfile({ [field]: next ?? null } as UpdateProfileInput);
      }}
    />
  );
}

export function FounderEditableField({
  label,
  value,
  field,
  editable,
  multiline,
  placeholder,
}: {
  label: string;
  value: string | null | undefined;
  field: keyof UpdateFounderProfileInput;
  editable: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <EditableField
      label={label}
      value={value}
      editable={editable}
      multiline={multiline}
      placeholder={placeholder}
      onSave={async (next) => {
        await updateFounderProfile({
          [field]: next ?? null,
        } as UpdateFounderProfileInput);
      }}
    />
  );
}

export function FounderEditableTagList({
  label,
  value,
  field,
  editable,
  muted,
  placeholder,
}: {
  label: string;
  value: string[] | null | undefined;
  field: keyof UpdateFounderProfileInput;
  editable: boolean;
  muted?: boolean;
  placeholder?: string;
}) {
  return (
    <EditableTagList
      label={label}
      value={value ?? []}
      editable={editable}
      muted={muted}
      placeholder={placeholder}
      onSave={async (next) => {
        await updateFounderProfile({
          [field]: next,
        } as UpdateFounderProfileInput);
      }}
    />
  );
}
