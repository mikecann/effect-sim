import { Select, Stack, Text } from "@mantine/core";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";
import {
  findStringEffect,
  findSwitchEffect,
  stringEffects,
  switchEffects,
} from "../../../shared/effects/registry";
import { PropEditor } from "./props/PropEditor";
import { EffectPreview } from "./simulation/EffectPreview";

const selectStyles = {
  input: {
    backgroundColor: "var(--mantine-color-dark-5)",
    borderColor: "var(--mantine-color-dark-4)",
  },
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/** An event's effect, its props, and (for string effects) a preview of it. */
export function EffectPropsSection({ event }: { event: AllTrackEventModels }) {
  const isString = event.kind === "string_effect";
  const effect = isString
    ? findStringEffect(event.effectDefinitionId)
    : findSwitchEffect(event.effectDefinitionId);
  const options = isString
    ? stringEffects.map((e) => ({ value: e.id, label: `${e.icon} ${e.name}` }))
    : switchEffects.map((e) => ({ value: e.id, label: e.name }));

  // What the event saved, over the effect's defaults.
  const values: Record<string, unknown> = {
    ...asRecord(effect?.defaults),
    ...asRecord(event.props),
  };
  const fields = Object.entries(effect?.props.shape ?? {});

  return (
    <Stack gap="md">
      <Select
        label="Effect"
        value={event.effectDefinitionId}
        onChange={(id) => {
          if (id) event.setEffectDefinitionId(id);
        }}
        data={options}
        placeholder="Select effect..."
        searchable
        size="sm"
        styles={selectStyles}
      />
      {fields.length > 0 ? (
        fields.map(([name, schema]) => (
          <PropEditor
            key={name}
            propName={name}
            propType={schema}
            value={values[name]}
            onChange={(value) => event.setProps({ ...values, [name]: value })}
          />
        ))
      ) : (
        <Text size="sm" c="dimmed">
          No configurable properties for this effect
        </Text>
      )}
      {effect?.kind === "string_effect" ? (
        <EffectPreview
          effect={effect}
          rawProps={event.props}
          seedKey={event.id}
        />
      ) : null}
    </Stack>
  );
}
