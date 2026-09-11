import {
  LayoutDashboard, User, UserRound, Users, Briefcase, FileText, CalendarDays, Files, FileCheck,
  UserRoundCheck, Search, Plus, Upload, Download, CheckCircle2, XCircle, RotateCcw, Bell,
  Settings, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Eye, EyeOff, Clock3, Mail, Phone,
  CircleDot, Check, X, ChevronLeft, ChevronRight, ChevronDown, LogOut, LogIn, SearchX, UserX,
  Send, Building2, GraduationCap, RefreshCw, Home, AlertCircle, Inbox, ClipboardList,
  ClipboardCheck, UserPlus,
} from 'lucide-react';

const REGISTRY = {
  LayoutDashboard, User, UserRound, Users, Briefcase, FileText, CalendarDays, Files, FileCheck,
  UserRoundCheck, Search, Plus, Upload, Download, CheckCircle2, XCircle, RotateCcw, Bell,
  Settings, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Eye, EyeOff, Clock3, Mail, Phone,
  CircleDot, Check, X, ChevronLeft, ChevronRight, ChevronDown, LogOut, LogIn, SearchX, UserX,
  Send, Building2, GraduationCap, RefreshCw, Home, AlertCircle, Inbox, ClipboardList,
  ClipboardCheck, UserPlus,
};

/**
 * Render a Lucide icon by name, e.g. <Icon name="CheckCircle2" size={16} />
 * Falls back to CircleDot when the name is unknown.
 */
export default function Icon({ name, size = 16, ...rest }) {
  const Cmp = REGISTRY[name] || CircleDot;
  return <Cmp size={size} {...rest} />;
}
