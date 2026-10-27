import { useColorModeValue } from '@chakra-ui/react';

// "Welcome, [Full Name]" strip at the top of a dashboard's main area.
export default function WelcomeHeader({ name }: { name: string }) {
  const color = useColorModeValue('#0f2240', '#e8f0fe');
  const border = useColorModeValue('#dde3ec', '#1e3048');
  const bg = useColorModeValue('#ffffff', '#0f1b2d');
  return (
    <div style={{ padding: "12px 32px", borderBottom: `1px solid ${border}`, background: bg, flexShrink: 0 }}>
      <span style={{ fontSize: "14px", color }}>Welcome, <b>{name}</b></span>
    </div>
  );
}
