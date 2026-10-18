import { Accessibility, BadgeCheck, BatteryCharging, Bell, Box, CalendarDays, ChartColumn, Clock, Crown, Gamepad2, Gift, GraduationCap, HeartHandshake, Image, Key, LayoutGrid, List, ScanLine, Megaphone, MessageSquareWarning, Receipt, ShieldPlus, Scale, Settings, Shield, Star, Tag, Trophy, Users, Wallet, type LucideIcon } from "lucide-react";

export const icons: Record<string, LucideIcon> = {
  calendar: CalendarDays, crown: Crown, clock: Clock, bell: Bell, wallet: Wallet, grid: LayoutGrid, users: Users, badge: BadgeCheck, star: Star, tag: Tag,
  shield: Shield, scale: Scale, trophy: Trophy, gamepad: Gamepad2, megaphone: Megaphone, alert: MessageSquareWarning, image: Image, box: Box, receipt: Receipt,
  graduation: GraduationCap, handshake: HeartHandshake, chart: ChartColumn, key: Key, list: List, settings: Settings, scan: ScanLine, gift: Gift, battery: BatteryCharging,
  wheelchair: Accessibility, insurance: ShieldPlus,
};
