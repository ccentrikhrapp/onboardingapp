import {
  LayoutDashboard, User, UserRound, Users, Briefcase, FileText, CalendarDays, Files, FileCheck, FileCheck2,
  UserRoundCheck, Search, SlidersHorizontal, Plus, Pencil, Trash2, Upload, UploadCloud,
  Download, CheckCircle2, XCircle, RotateCcw, Bell, CircleUserRound, Settings, ArrowLeft,
  ArrowRight, ArrowUp, ArrowDown, MoreHorizontal, Eye, EyeOff, Clock3, MapPin, Mail, Phone,
  CircleDot, Circle, Check, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Menu, History, Sparkles,
  AlertCircle, AlertTriangle, Info, Inbox, Hash, Video, CalendarPlus, CalendarCheck,
  ClipboardCheck, ClipboardList, Route, LogOut, SearchX, UserX, Send, Save,
  Building2, BadgeCheck, GraduationCap, Wallet, Rocket, Sparkle,
  RefreshCw, TrendingUp, Zap, Activity, CalendarClock, ListChecks, Target,
  Home, LifeBuoy, Moon, MessageSquare, Lightbulb, Play, Square, Bot,
  ShieldCheck, Globe, UserPlus, UserCheck,
} from 'lucide-react';

const REGISTRY = {
  LayoutDashboard, User, UserRound, Users, Briefcase, FileText, CalendarDays, Files, FileCheck, FileCheck2,
  UserRoundCheck, Search, SlidersHorizontal, Plus, Pencil, Trash2, Upload, UploadCloud,
  Download, CheckCircle2, XCircle, RotateCcw, Bell, CircleUserRound, Settings, ArrowLeft,
  ArrowRight, ArrowUp, ArrowDown, MoreHorizontal, Eye, EyeOff, Clock3, MapPin, Mail, Phone,
  CircleDot, Circle, Check, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Menu, History, Sparkles,
  AlertCircle, AlertTriangle, Info, Inbox, Hash, Video, CalendarPlus, CalendarCheck,
  ClipboardCheck, ClipboardList, Route, LogOut, SearchX, UserX, Send, Save,
  Building2, BadgeCheck, GraduationCap, Wallet, Rocket, Sparkle,
  RefreshCw, TrendingUp, Zap, Activity, CalendarClock, ListChecks, Target,
  Home, LifeBuoy, Moon, MessageSquare, Lightbulb, Play, Square, Bot,
  ShieldCheck, Globe, UserPlus, UserCheck,
};

/**
 * Render a Lucide icon by name, e.g. <Icon name="CheckCircle2" size={16} />
 * Falls back to CircleDot when the name is unknown.
 */
export default function Icon({ name, size = 16, ...rest }) {
  const Cmp = REGISTRY[name] || CircleDot;
  return <Cmp size={size} {...rest} />;
}
