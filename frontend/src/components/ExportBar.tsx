import { useState } from 'react';
import { Button, HStack, useToast } from '@chakra-ui/react';
import { authFetch } from './authFetch';

// Download the report as a CSV file (built on the server) or print it / save it as a PDF through the
// browser's print dialog. The print layout hides this bar and the navigation (see index.css).
export default function ExportBar({ csvPath, fileName }: { csvPath: string; fileName: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}${csvPath}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not export.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, status: 'error', position: 'top' });
    }
    setBusy(false);
  };

  const print = () => {
    document.body.classList.add('printing-report');
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'), { once: true });
    window.print();
  };

  return (
    <HStack spacing={2} className="no-print">
      <Button size="xs" variant="outline" onClick={download} isLoading={busy}>Download CSV</Button>
      <Button size="xs" variant="outline" onClick={print}>Print / Save as PDF</Button>
    </HStack>
  );
}
