import {
  Building2,
  CalendarClock,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  FileText,
  Gamepad2,
  Heart,
  HeartHandshake,
  HeartPulse,
  House,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Link2,
  Luggage,
  Map as MapIcon,
  Maximize2,
  MessageCircle,
  MessageCircleHeart,
  MessagesSquare,
  Mic,
  MicOff,
  Minimize2,
  NotebookPen,
  OctagonAlert,
  Package as PackageIcon,
  Pencil,
  Phone,
  PhoneOff,
  PlaneTakeoff,
  Plus,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Settings as SettingsIcon,
  ShoppingCart,
  SwitchCamera,
  Target,
  Trash2,
  Users,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  Wallet,
  WifiOff,
} from 'lucide-react';

const { useRef, useEffect } = React;

const ICONS = {
  Building2,
  CalendarClock,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FileText,
  Gamepad2,
  Heart,
  HeartHandshake,
  HeartPulse,
  House,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Link2,
  Luggage,
  Map: MapIcon,
  Maximize2,
  MessageCircle,
  MessageCircleHeart,
  MessagesSquare,
  Mic,
  MicOff,
  Minimize2,
  NotebookPen,
  OctagonAlert,
  Package: PackageIcon,
  Pencil,
  Phone,
  PhoneOff,
  PlaneTakeoff,
  Plus,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Settings: SettingsIcon,
  ShoppingCart,
  SwitchCamera,
  Target,
  Trash2,
  Users,
  Video: VideoIcon,
  VideoIcon,
  VideoOff,
  Volume2,
  Wallet,
  WifiOff,
};

function AnimatedIcon({ name, size = 22, play, style, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    if (play == null || play === 0 || !ref.current) return;
    const reduceMotion = window.__lifeosPreferences?.motion === 'reduced'
      || window.__lifeos?.performance.shouldUseLiteVisuals()
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || typeof ref.current.animate !== 'function') return;
    const animation = ref.current.animate([
      { transform: 'scale(0.88) rotate(-5deg)', opacity: 0.72 },
      { transform: 'scale(1.08) rotate(2deg)', opacity: 1, offset: 0.62 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return () => animation.cancel();
  }, [play]);

  const IconComponent = ICONS[name] || CircleHelp;

  return React.createElement(
    'span',
    { ref, style: { display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', ...style } },
    React.createElement(IconComponent, { size, ...props }),
  );
}

Object.assign(window, { AnimatedIcon });
