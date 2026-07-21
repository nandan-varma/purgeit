import { Box, Text } from 'ink';
import { glyphs, theme } from '../theme.js';

function KeyRow({ keys, description }: { keys: string; description: string }) {
  return (
    <Text>
      <Text bold color={theme.accent}>
        {keys.padEnd(16)}
      </Text>
      {description}
    </Text>
  );
}

export function HelpOverlay() {
  return (
    // flexShrink={0}: see Header.tsx's comment — this is bordered chrome
    // stacked on top of Header (and the always-rendered Legend below), so it
    // must render fully or be clipped whole by the app root's overflow
    // clamp, never squashed into a garbled partial box.
    <Box
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={1}
      flexDirection="column"
      marginTop={1}
      flexShrink={0}
    >
      <Text bold color={theme.accent}>
        Keybindings
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <KeyRow keys="↑/k  ↓/j" description="move cursor" />
        <KeyRow keys="Home/g  End/G" description="jump to first / last" />
        <KeyRow keys="PgUp / PgDn" description="jump a page" />
        <KeyRow keys="space" description="toggle selection" />
        <KeyRow keys="a / n / i" description="select all / clear / invert" />
        <KeyRow keys="s / r" description="cycle sort key / reverse direction" />
        <KeyRow keys="enter" description="review & confirm deletion (needs ≥1 selected)" />
        <KeyRow keys="q / Ctrl+C" description="quit without deleting" />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={theme.cursorBg}>{'  '}</Text> cursor row
        </Text>
        <Text>
          <Text color={theme.selectedBg}>{'  '}</Text> selected — will be deleted
        </Text>
        <Text>
          <Text color={theme.gated}>{glyphs.bullet} gated</Text> — needs a sibling manifest
        </Text>
        <Text>{glyphs.bullet} safe — always deletable</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press any key to close</Text>
      </Box>
    </Box>
  );
}
