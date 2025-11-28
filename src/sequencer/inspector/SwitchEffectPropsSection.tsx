import { Stack, Text, Select } from "@mantine/core";
import {
  switchEffectDefinitions,
  switchEffectDefinitionsArray,
} from "../../common/effects/switchEffectDefinitions";
import { PropEditor } from "./props/PropEditor";
import type { z } from "zod";
import { useState, useEffect, useRef, startTransition } from "react";
import type { AllTrackEventModels } from "../../../shared/models/sequencer";

type SwitchEffectPropsSectionProps = {
  event: AllTrackEventModels;
};

export function SwitchEffectPropsSection({
  event,
}: SwitchEffectPropsSectionProps) {
  const sequence = event.track.sequence;

  // Track local state for optimistic updates
  const [localProps, setLocalProps] = useState<Record<string, unknown> | null>(
    null,
  );
  const prevEventIdRef = useRef<string | null>(null);

  // Reset local state when event changes
  useEffect(() => {
    // Only reset when event ID or effect actually changes
    const effect =
      event.kind === "switch_effect" ? event.effectDefinitionId : null;
    const eventKey = `${event.id}-${effect ?? ""}`;
    if (prevEventIdRef.current === eventKey) return;
    prevEventIdRef.current = eventKey;

    startTransition(() => {
      setLocalProps(null);
    });
  }, [
    event.id,
    event.kind,
    event.effectDefinitionId,
    event.props,
  ]);

  // Find the effect definition
  const primaryEffectId =
    event.kind === "switch_effect" ? event.effectDefinitionId : null;
  const effectDefinition = Object.values(switchEffectDefinitions).find(
    (def) => def.id === primaryEffectId,
  );

  const hasProps =
    effectDefinition && "props" in effectDefinition && effectDefinition.props;

  // Get the shape of the props schema
  const propsShape = hasProps ? effectDefinition.props.shape : {};

  // Merge default props with current props from event
  const defaultProps = effectDefinition?.defaultProps || {};
  const eventProps =
    event.kind === "switch_effect"
      ? (event.props as Record<string, unknown> | undefined)
      : undefined;
  const baseParams = { ...defaultProps, ...eventProps } as Record<
    string,
    unknown
  >;

  // Use local params if they exist (for optimistic updates), otherwise use merged params
  const displayParams: Record<string, unknown> =
    localProps === null ? baseParams : localProps;

  const handlePropChange = (propName: string, value: unknown) => {
    const updatedProps = {
      ...displayParams,
      [propName]: value,
    };

    // Update local state immediately for optimistic UI
    setLocalProps(updatedProps);

    // Update directly to the model
    try {
      event.setProps(updatedProps);
    } catch (error) {
      console.error("Failed to update event props:", error);
    }
  };

  return (
    <Stack gap="md">
      <Select
        label="Effect"
        value={event.kind === "switch_effect" ? event.effectDefinitionId : null}
        onChange={(effectId) => {
          if (!effectId) return;
          try {
            event.setEffectDefinitionId(effectId);
          } catch (error) {
            console.error("Failed to update effect:", error);
          }
        }}
        data={switchEffectDefinitionsArray.map((def) => ({
          value: def.id,
          label: def.name,
        }))}
        placeholder="Select effect..."
        searchable
        clearable
        size="sm"
        styles={{
          input: {
            backgroundColor: "var(--mantine-color-dark-5)",
            borderColor: "var(--mantine-color-dark-4)",
          },
        }}
      />
      {hasProps ? (
        Object.entries(propsShape).map(([propName, propType]) => (
          <PropEditor
            key={propName}
            propName={propName}
            propType={propType as z.ZodTypeAny}
            value={displayParams[propName]}
            onChange={(value) => handlePropChange(propName, value)}
          />
        ))
      ) : (
        <Text size="sm" c="dimmed">
          No configurable properties for this effect
        </Text>
      )}
    </Stack>
  );
}
