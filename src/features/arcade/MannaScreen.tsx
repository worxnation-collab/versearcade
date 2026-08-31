import { useMemo } from 'react'
import { useSettings } from '@/store/settings'
import { TapGameScreen } from './TapGameScreen'
import { MANNA_RUSH } from './manna'
import { mannaSurface } from './MannaField'

// Manna Rush: the machine about judgement — should you take this one?
export default function MannaScreen({ demo }: { demo?: boolean }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const surface = useMemo(() => mannaSurface({ reduceMotion }), [reduceMotion])

  return (
    <TapGameScreen
      id="manna"
      game={MANNA_RUSH}
      surface={surface}
      tagline="Seven days in the wilderness · Exodus 16"
      how={[
        'Manna falls with the dew. Tap the bright, round flakes to gather your omer.',
        'Leave the pale lumpy ones — those were kept from yesterday, and they bred worms. On the seventh day nothing falls, and the best thing you can do is keep still.',
      ]}
      cta="Go out and gather"
      demo={demo}
    />
  )
}
