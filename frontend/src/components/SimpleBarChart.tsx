import { Box, Flex, Text } from '@chakra-ui/react';

// Minimal dependency-free bar chart, shared by AdminDashboard and
// DeanDashboard. No charting library is installed in this project, and
// adding one this close to defense would mean a new, untested dependency —
// so this renders bars with plain divs instead.
export default function SimpleBarChart({
  data,
  color = '#2563eb',
  height = 160,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <Flex align="flex-end" gap={3} h={`${height}px`} overflowX="auto" pb={2}>
      {data.map((d, i) => (
        <Flex key={`${d.label}-${i}`} direction="column" align="center" justify="flex-end" h="100%" minW="48px">
          <Text fontSize="xs" fontWeight="700" mb={1}>{d.value}</Text>
          <Box
            w="28px"
            borderRadius="4px 4px 0 0"
            bg={color}
            h={`${Math.max(4, (d.value / max) * (height - 40))}px`}
            transition="height 0.2s"
          />
          <Text fontSize="10px" mt={2} textAlign="center" color="gray.500" noOfLines={2} maxW="56px">{d.label}</Text>
        </Flex>
      ))}
    </Flex>
  );
}
