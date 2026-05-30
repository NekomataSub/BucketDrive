import * as ContextMenu from "@radix-ui/react-context-menu"
import {
  FolderOpen,
  Download,
  Pencil,
  Trash2,
  Share2,
  Copy,
  ArrowRightLeft,
  Star,
  Tags,
  Eye,
} from "lucide-react"

interface FileContextMenuProps {
  itemId: string
  itemType: "file" | "folder"
  children: React.ReactNode
  onOpen?: () => void
  onPreview?: () => void
  onDownload?: () => void
  onRename?: () => void
  onDelete?: () => void
  onShare?: () => void
  onFavorite?: () => void
  favoriteLabel?: string
  onTags?: () => void
  onCopy?: () => void
  onMove?: () => void
}

const menuItemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-primary outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-active data-[highlighted]:text-text-primary data-[disabled]:text-text-tertiary"
const separatorClass = "mx-2 my-1 h-px bg-border-muted"

export function FileContextMenu({
  itemId: _itemId,
  itemType,
  children,
  onOpen,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onShare,
  onFavorite,
  favoriteLabel = "Favorite",
  onTags,
  onCopy,
  onMove,
}: FileContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[180px] overflow-hidden rounded-lg border border-border-default bg-surface-default p-1.5 shadow-lg"> 
          {onOpen && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onOpen()
              }}
            >
              <FolderOpen className="h-4 w-4 text-text-tertiary" />
              Open
              <span className="ml-auto text-xs text-text-tertiary">Enter</span>
            </ContextMenu.Item>
          )}

          {itemType === "file" && onPreview && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onPreview()
              }}
            >
              <Eye className="h-4 w-4 text-text-tertiary" />
              Preview
              <span className="ml-auto text-xs text-text-tertiary">Space</span>
            </ContextMenu.Item>
          )}

          {itemType === "file" && onDownload && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onDownload()
              }}
            >
              <Download className="h-4 w-4 text-text-tertiary" />
              Download
            </ContextMenu.Item>
          )}

          {(itemType === "file" && (onPreview || onDownload)) && (
            <ContextMenu.Separator className={separatorClass} />
          )}

          {itemType === "file" && onFavorite && (
            <>
              <ContextMenu.Item
                className={menuItemClass}
                onClick={() => {
                  onFavorite()
                }}
              >
                <Star className="h-4 w-4 text-text-tertiary" />
                {favoriteLabel}
              </ContextMenu.Item>
              {onTags && (
                <ContextMenu.Item
                  className={menuItemClass}
                  onClick={() => {
                    onTags()
                  }}
                >
                  <Tags className="h-4 w-4 text-text-tertiary" />
                  Tags
                </ContextMenu.Item>
              )}
              <ContextMenu.Separator className={separatorClass} />
            </>
          )}

          {onRename && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onRename()
              }}
            >
              <Pencil className="h-4 w-4 text-text-tertiary" />
              Rename
              <span className="ml-auto text-xs text-text-tertiary">F2</span>
            </ContextMenu.Item>
          )}

          {onCopy && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onCopy()
              }}
            >
              <Copy className="h-4 w-4 text-text-tertiary" />
              Copy
              <span className="ml-auto text-xs text-text-tertiary">Ctrl+C</span>
            </ContextMenu.Item>
          )}

          {onMove && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onMove()
              }}
            >
              <ArrowRightLeft className="h-4 w-4 text-text-tertiary" />
              Move
            </ContextMenu.Item>
          )}

          {(onRename || onCopy || onMove) && <ContextMenu.Separator className={separatorClass} />}

          {onShare && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onShare()
              }}
            >
              <Share2 className="h-4 w-4 text-text-tertiary" />
              Share
            </ContextMenu.Item>
          )}

          {onShare && <ContextMenu.Separator className={separatorClass} />}

          {onDelete && (
            <ContextMenu.Item
              className={menuItemClass}
              onClick={() => {
                onDelete()
              }}
            >
              <Trash2 className="h-4 w-4 text-text-tertiary" />
              Delete
              <span className="ml-auto text-xs text-text-tertiary">Del</span>
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
