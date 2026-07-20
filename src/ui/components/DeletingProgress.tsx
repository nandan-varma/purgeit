import { Text } from 'ink';
import React from 'react';

export function DeletingProgress({ deleted, failed }: { deleted: number; failed: number }) {
  return (
    <Text>
      <Text color="yellow">Deleting...</Text> {deleted} deleted, {failed} failed
    </Text>
  );
}
