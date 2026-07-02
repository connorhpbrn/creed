import { forwardRef, type ComponentType, type Ref } from "react";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowBendUpLeft,
  Archive,
  At,
  Bell,
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  CircleHalfTilt,
  Clock,
  ClockCounterClockwise,
  CloudArrowDown,
  CloudArrowUp,
  Code,
  CircleDashed,
  Copy,
  DownloadSimple,
  DotsThree,
  DotsThreeVertical,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  FileText,
  Flag,
  FloppyDisk,
  Folder,
  FolderOpen,
  FrameCorners,
  Funnel,
  GearSix,
  GridFour,
  ChatText,
  Link,
  ListBullets,
  ListNumbers,
  Lock,
  LockOpen,
  MagnifyingGlass,
  Minus,
  PaperPlaneTilt,
  Paragraph,
  PenNib,
  PencilSimple,
  Plus,
  PlusSquare,
  Plugs,
  Plug,
  Sidebar,
  Share,
  Shield,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  SpinnerGap,
  Stack,
  Star,
  Stamp,
  Table,
  Tag,
  TShirt,
  TextB,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  Trash,
  TreeStructure,
  Warning,
  X,
  type IconProps,
} from "@phosphor-icons/react";

type PhosphorIcon = ComponentType<IconProps & { ref?: Ref<SVGSVGElement> }>;
type LegacyIconProps = IconProps & {
  absoluteStrokeWidth?: boolean;
  strokeWidth?: number;
};

function icon(Component: PhosphorIcon) {
  const Wrapped = forwardRef<SVGSVGElement, LegacyIconProps>(
    ({ absoluteStrokeWidth: _absoluteStrokeWidth, strokeWidth: _strokeWidth, weight, ...props }, ref) => (
      <Component ref={ref} weight={weight ?? "regular"} {...props} />
    )
  );
  Wrapped.displayName = "PhosphorIcon";
  return Wrapped;
}

const ArrowLeftIcon = icon(ArrowLeft);
const ArrowRightIcon = icon(ArrowRight);
const ArrowUpIcon = icon(ArrowUp);
const ArrowDownIcon = icon(ArrowDown);
const ArrowBendUpLeftIcon = icon(ArrowBendUpLeft);
const ArchiveIcon = icon(Archive);
const AtSignIcon = icon(At);
const BellIcon = icon(Bell);
const BookmarkIcon = icon(BookmarkSimple);
const BoldIcon = icon(TextB);
export const CheckIcon = icon(Check);
const CheckCircleIcon = icon(CheckCircle);
const ChevronDownIcon = icon(CaretDown);
const ChevronLeftIcon = icon(CaretLeft);
export const ChevronRightIcon = icon(CaretRight);
const CircleDashedIcon = icon(CircleDashed);
const ContrastIcon = icon(CircleHalfTilt);
const Clock3Icon = icon(Clock);
const CloudDownloadIcon = icon(CloudArrowDown);
const CloudUploadIcon = icon(CloudArrowUp);
const Code2Icon = icon(Code);
const CopyIcon = icon(Copy);
const DeleteIcon = icon(Trash);
const DownloadIcon = icon(DownloadSimple);
const EllipsisIcon = icon(DotsThree);
const EyeIcon = icon(Eye);
const EyeOffIcon = icon(EyeSlash);
const FileTextIcon = icon(FileText);
const FileStackIcon = icon(Stack);
const FlagIcon = icon(Flag);
const FolderIcon = icon(Folder);
const FolderUpIcon = icon(FolderOpen);
const FrameCornersIcon = icon(FrameCorners);
const FolderTreeIcon = icon(TreeStructure);
const FunnelIcon = icon(Funnel);
const SettingsIcon = icon(GearSix);
const GripVerticalIcon = icon(DotsThreeVertical);
const Heading2Icon = icon(TextHTwo);
const Heading3Icon = icon(TextHThree);
const HistoryIcon = icon(ClockCounterClockwise);
const ItalicIcon = icon(TextItalic);
const LayoutGridIcon = icon(GridFour);
const Link2Icon = icon(Link);
const ListIcon = icon(ListBullets);
const ListOrderedIcon = icon(ListNumbers);
const LockIcon = icon(Lock);
const LockOpenIcon = icon(LockOpen);
const LoaderCircleIcon = icon(SpinnerGap);
const MailCheckIcon = icon(EnvelopeSimple);
const MessageSquareIcon = icon(ChatText);
const MessageSquareQuoteIcon = icon(ChatText);
const MinusIcon = icon(Minus);
const MoreHorizontalIcon = icon(DotsThree);
const PanelLeftIcon = icon(Sidebar);
const PenToolIcon = icon(PenNib);
const PilcrowIcon = icon(Paragraph);
const PlugIcon = icon(Plug);
const PlusSquareIcon = icon(PlusSquare);
const PlusIcon = icon(Plus);
const RotateCcwIcon = icon(ArrowCounterClockwise);
const RotateCwIcon = icon(ArrowClockwise);
const SearchIcon = icon(MagnifyingGlass);
const SendIcon = icon(PaperPlaneTilt);
const SaveIcon = icon(FloppyDisk);
const ShareIcon = icon(Share);
const ShieldIcon = icon(Shield);
const ShieldCheckIcon = icon(ShieldCheck);
const LogoutIcon = icon(SignOut);
const SlidersHorizontalIcon = icon(SlidersHorizontal);
const StarIcon = icon(Star);
const StampIcon = icon(Stamp);
const TableIcon = icon(Table);
const StrikethroughIcon = icon(TextStrikethrough);
const SquarePenIcon = icon(PencilSimple);
const TagIcon = icon(Tag);
const TShirtIcon = icon(TShirt);
const UnplugIcon = icon(Plugs);
const AlertTriangleIcon = icon(Warning);
export const XIcon = icon(X);

export {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  ArrowUpIcon as ArrowUp,
  ArrowDownIcon as ArrowDown,
  ArrowBendUpLeftIcon as Reply,
  ArchiveIcon as Archive,
  AlertTriangleIcon as AlertTriangle,
  AtSignIcon as AtSign,
  BellIcon as Bell,
  BookmarkIcon as Bookmark,
  BoldIcon as Bold,
  CheckIcon as Check,
  CheckCircleIcon as CheckCircle2,
  ChevronDownIcon as ChevronDown,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  CircleDashedIcon as CircleDashed,
  ContrastIcon as Contrast,
  Clock3Icon as Clock3,
  CloudDownloadIcon as CloudDownload,
  CloudUploadIcon as CloudUpload,
  Code2Icon as Code2,
  CopyIcon as Copy,
  DeleteIcon as Delete,
  DownloadIcon as Download,
  EllipsisIcon as Ellipsis,
  EyeIcon as Eye,
  EyeOffIcon as EyeOff,
  FileTextIcon as FileText,
  FileStackIcon as FileStack,
  FlagIcon as Flag,
  FolderIcon as Folder,
  FolderUpIcon as FolderUp,
  FrameCornersIcon as Embed,
  FunnelIcon as Funnel,
  SettingsIcon as Settings,
  GripVerticalIcon as GripVertical,
  Heading2Icon as Heading2,
  Heading3Icon as Heading3,
  HistoryIcon as History,
  ItalicIcon as Italic,
  LayoutGridIcon as LayoutGrid,
  Link2Icon as Link2,
  ListIcon as List,
  ListOrderedIcon as ListOrdered,
  LockIcon as Lock,
  LockOpenIcon as LockOpen,
  LoaderCircleIcon as LoaderCircle,
  MailCheckIcon as MailCheck,
  MessageSquareIcon as MessageSquare,
  MessageSquareQuoteIcon as MessageSquareQuote,
  MinusIcon as Minus,
  MoreHorizontalIcon as MoreHorizontal,
  PenToolIcon as PenTool,
  PilcrowIcon as Pilcrow,
  PlugIcon as Plug,
  PlusIcon as Plus,
  PlusSquareIcon as PlusSquare,
  RotateCcwIcon as RotateCcw,
  RotateCwIcon as RotateCw,
  SearchIcon as Search,
  SaveIcon as Save,
  SendIcon as Send,
  ShareIcon as Share,
  ShieldCheckIcon as ShieldCheck,
  LogoutIcon as Logout,
  SlidersHorizontalIcon as SlidersHorizontal,
  SquarePenIcon as SquarePen,
  StampIcon as Stamp,
  TableIcon as Table,
  StrikethroughIcon as Strikethrough,
  TagIcon as Tag,
  FolderTreeIcon as TreeStructure,
  TShirtIcon as TShirt,
  UnplugIcon as Unplug,
  XIcon as X,
};
