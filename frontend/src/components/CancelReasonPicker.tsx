import { useState } from 'react';
import { Select, Checkbox, Textarea, VStack, Text, useColorModeValue } from '@chakra-ui/react';

export interface CancelReasonOption {
  label: string; // saved as the reason and shown in notifications / tables
  hint: string;  // helper text shown under the dropdown once selected
}

export const STUDENT_CANCEL_REASONS: CancelReasonOption[] = [
  { label: 'Academic Conflict / Exam Conflict', hint: 'e.g., Conflict with major exam, class project deadline' },
  { label: 'Resolved Issue', hint: 'e.g., Question already answered, or issue resolved via email or peer' },
  { label: 'Personal / Health Emergency', hint: 'e.g., Sickness / medical appointment, family emergency' },
  { label: 'Transportation / Weather Issues', hint: 'e.g., Suspended classes, bad weather / typhoon, transport trouble' },
  { label: 'Schedule Change', hint: 'e.g., Faculty member posted an update: In Class / Not Available' },
];

export const FACULTY_CANCEL_REASONS: CancelReasonOption[] = [
  { label: 'Official University Duties', hint: 'e.g., Administrative meeting, committee assignment, faculty assembly' },
  { label: 'Emergency Leave / Personal Leave', hint: 'e.g., Sick leave, emergency personal leave' },
  { label: 'Teaching Overload / Class Extension', hint: 'e.g., Extended class discussion, makeup class' },
  { label: 'Student No-Show / Late Response', hint: 'If cancelling after the student fails to arrive within the grace period' },
  { label: 'Slot Unavailable / Fully Booked', hint: 'If the slot was accidentally double-booked or clashed with a fixed consultation limit' },
];

interface Props {
  options: CancelReasonOption[];
  /** Called with the final reason text ('' while nothing valid is chosen/typed). */
  onChange: (reason: string) => void;
}

/**
 * Reason dropdown with an "Others" checkbox. Ticking "Others" disables the dropdown
 * and shows a text box instead. Remount it (change its `key`) to reset it.
 */
export default function CancelReasonPicker({ options, onChange }: Props) {
  const [preset, setPreset] = useState('');
  const [useOthers, setUseOthers] = useState(false);
  const [otherText, setOtherText] = useState('');

  const textColor = useColorModeValue('#0f2240', '#e8f0fe');
  const borderColor = useColorModeValue('#dde3ec', '#1e3048');
  const mutedText = useColorModeValue('#6b7fa0', '#7a93b0');
  const selectedHint = options.find(o => o.label === preset)?.hint;

  return (
    <VStack align="stretch" spacing={3}>
      <Select
        placeholder="Select a reason"
        value={preset}
        isDisabled={useOthers}
        onChange={(e) => { setPreset(e.target.value); onChange(e.target.value); }}
        color={textColor} borderColor={borderColor}
      >
        {options.map(opt => <option key={opt.label} value={opt.label}>{opt.label}</option>)}
      </Select>
      {!useOthers && selectedHint && <Text fontSize="xs" color={mutedText} mt={-1}>{selectedHint}</Text>}
      <Checkbox
        isChecked={useOthers}
        onChange={(e) => {
          setUseOthers(e.target.checked);
          onChange(e.target.checked ? otherText.trim() : preset);
        }}
        color={textColor}
      >
        Others (type your own reason)
      </Checkbox>
      {useOthers && (
        <Textarea
          rows={3} maxLength={300} value={otherText}
          placeholder="Please specify your reason..."
          onChange={(e) => { setOtherText(e.target.value); onChange(e.target.value.trim()); }}
          color={textColor} borderColor={borderColor}
        />
      )}
    </VStack>
  );
}
