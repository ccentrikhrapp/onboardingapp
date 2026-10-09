import {
  LayoutDashboard, User, UserRound, Users, Briefcase, FileText, CalendarDays, Files, FileCheck,
  UserRoundCheck, Search, Plus, Upload, Download, CheckCircle2, XCircle, RotateCcw, Bell,
  Settings, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Eye, EyeOff, Clock3, Mail, Phone,
  CircleDot, Check, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, LogOut, LogIn, SearchX, UserX,
  Send, Building2, GraduationCap, RefreshCw, Home, AlertCircle, Inbox, ClipboardList,
  ClipboardCheck, UserPlus, ArrowRightLeft, FileCheck2, CalendarCheck2,
  AlertTriangle, CalendarCheck, Menu, Rocket, Activity, CalendarClock, CalendarPlus, FileSearch, History,
  ShieldCheck, UserCheck, Trash2,
  Printer, Info, ListChecks, Pencil,
} from 'lucide-react';

const REGISTRY = {
  Printer, Info,
  LayoutDashboard, User, UserRound, Users, Briefcase, FileText, CalendarDays, Files, FileCheck,
  UserRoundCheck, Search, Plus, Upload, Download, CheckCircle2, XCircle, RotateCcw, Bell,
  Settings, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Eye, EyeOff, Clock3, Mail, Phone,
  CircleDot, Check, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, LogOut, LogIn, SearchX, UserX,
  Send, Building2, GraduationCap, RefreshCw, Home, AlertCircle, Inbox, ClipboardList,
  ClipboardCheck, UserPlus, ArrowRightLeft, FileCheck2, CalendarCheck2,
  AlertTriangle, CalendarCheck, Menu, Rocket, Activity, CalendarClock, CalendarPlus, FileSearch, History,
  ShieldCheck, UserCheck, Trash2, ListChecks, Pencil,
};

/**
 * Render a Lucide icon by name, e.g. <Icon name="CheckCircle2" size={16} />
 * Falls back to CircleDot when the name is unknown.
 */
export default function Icon({ name, size = 16, ...rest }) {
  const Cmp = REGISTRY[name] || CircleDot;
  return <Cmp size={size} {...rest} />;
}
