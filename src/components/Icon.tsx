import {
  Apple, Bed, Bike, BookOpen, Brain, Briefcase, Camera, Code, Coffee, Droplet, Dumbbell, Film, Flame, Folder,
  Footprints, Gift, GraduationCap, Heart, House, Leaf, Lightbulb, Moon, Mountain, Music, Palette, PawPrint,
  Pencil, Pill, Plane, Rocket, ShoppingCart, Smile, Star, Sunrise, Target, Trophy, Utensils, Wallet, Wrench,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

// Only the icons users can pick for projects and habits, so the bundle stays small.
const ICONS: Record<string, LucideIcon> = {
  apple: Apple, bed: Bed, bike: Bike, 'book-open': BookOpen, brain: Brain, briefcase: Briefcase, camera: Camera,
  code: Code, coffee: Coffee, droplet: Droplet, dumbbell: Dumbbell, film: Film, flame: Flame, folder: Folder,
  footprints: Footprints, gift: Gift, 'graduation-cap': GraduationCap, heart: Heart, house: House, leaf: Leaf,
  lightbulb: Lightbulb, moon: Moon, mountain: Mountain, music: Music, palette: Palette, 'paw-print': PawPrint,
  pencil: Pencil, pill: Pill, plane: Plane, rocket: Rocket, 'shopping-cart': ShoppingCart, smile: Smile,
  star: Star, sunrise: Sunrise, target: Target, trophy: Trophy, utensils: Utensils, wallet: Wallet, wrench: Wrench,
};

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? Folder;
  return <C {...props} />;
}
