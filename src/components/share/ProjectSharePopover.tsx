import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Eye,
  Globe2,
  Link2,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type SharePermission = 'view' | 'comment' | 'edit';

interface ProjectSharePopoverProps {
  projectId?: string | null;
  projectName?: string | null;
  className?: string;
}

interface CurrentUserInfo {
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getPermissionLabel(permission: SharePermission) {
  switch (permission) {
    case 'edit':
      return 'Can edit';
    case 'comment':
      return 'Can comment';
    case 'view':
    default:
      return 'Can view';
  }
}

export function ProjectSharePopover({
  projectId,
  projectName,
  className,
}: ProjectSharePopoverProps) {
  const [open, setOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUserInfo | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<SharePermission>('edit');
  const [linkPermission, setLinkPermission] = useState<SharePermission>('view');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) {
        return;
      }

      const user = data.user;
      if (!user) {
        setCurrentUser(null);
        return;
      }

      setCurrentUser({
        email: user.email ?? 'Authenticated user',
        displayName:
          user.user_metadata?.display_name ??
          user.user_metadata?.full_name ??
          user.email?.split('@')[0] ??
          'Studio user',
        avatarUrl: user.user_metadata?.avatar_url ?? null,
      });
    });

    return () => {
      active = false;
    };
  }, [open]);

  const projectLabel = projectName?.trim() || 'Untitled project';
  const inviteDisabled = !projectId || !inviteEmail.trim() || isInviting;

  const workspaceSummary = useMemo(
    () => ({
      title: projectLabel,
      subtitle: 'Share access is currently link-based for this project.',
    }),
    [projectLabel]
  );

  const runCreateShare = async (options: { permission: SharePermission; isPublic: boolean; inviteEmail?: string }) => {
    const { data, error } = await supabase.functions.invoke('create-share', {
      body: {
        projectId,
        permission: options.permission,
        isPublic: options.isPublic,
        inviteEmail: options.inviteEmail,
      },
    });

    if (error) {
      throw error;
    }

    const nextLink = data?.shareLink || data?.shareUrl;
    if (typeof nextLink === 'string' && nextLink.trim().length > 0) {
      setShareLink(nextLink);
      return nextLink;
    }

    return null;
  };

  const handleInvite = async () => {
    if (!projectId) {
      toast.warning('Please select a project to share');
      return;
    }

    setIsInviting(true);
    try {
      await runCreateShare({
        permission: invitePermission,
        isPublic: false,
        inviteEmail: inviteEmail.trim(),
      });
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to invite collaborator';
      toast.error(message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!projectId) {
      toast.warning('Please select a project to share');
      return;
    }

    setIsCopying(true);
    try {
      const link =
        shareLink ||
        (await runCreateShare({
          permission: linkPermission,
          isPublic: true,
        }));

      if (!link) {
        throw new Error('No share link returned');
      }

      await navigator.clipboard.writeText(link);
      toast.success('Share link copied');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy share link';
      toast.error(message);
    } finally {
      setIsCopying(false);
    }
  };

  const renderPersonRow = (options: {
    title: string;
    subtitle: string;
    avatarLabel: string;
    avatarUrl?: string | null;
    trailing?: string;
  }) => (
    <div className="flex items-center gap-3 rounded-[18px] border border-white/6 bg-[#171717] px-3 py-3">
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-[#2EA8A4] text-sm font-semibold text-white">
        {options.avatarUrl ? (
          <img src={options.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          options.avatarLabel
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{options.title}</div>
        <div className="truncate text-xs text-zinc-500">{options.subtitle}</div>
      </div>
      {options.trailing ? <div className="text-xs text-zinc-400">{options.trailing}</div> : null}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          type="button"
          className={cn(
            'h-10 rounded-[14px] border-0 bg-[#8FD97D] px-4 text-sm font-semibold text-[#0D130D] shadow-[0_10px_24px_rgba(143,217,125,0.18)] hover:bg-[#9ce38b]',
            className
          )}
          onClick={(event) => {
            if (!projectId) {
              event.preventDefault();
              toast.warning('Please select a project to share');
            }
          }}
        >
          Share
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={12}
        collisionPadding={{ top: 72, right: 16, left: 16, bottom: 16 }}
        className="w-[min(444px,calc(100vw-32px))] rounded-[24px] border border-white/10 bg-[#121212]/98 p-0 text-white shadow-[0_32px_90px_rgba(0,0,0,0.52)] backdrop-blur-2xl"
      >
        <div className="border-b border-white/8 px-4 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center rounded-t-[12px] border border-white/8 border-b-transparent bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-white"
            >
              Share
            </button>
            <span className="inline-flex items-center px-2 py-2 text-sm text-zinc-500">Publish</span>
          </div>
        </div>

        <div className="space-y-5 px-4 py-4">
          <section className="space-y-3">
            <div className="text-sm font-medium text-zinc-200">Share this project</div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="email@company.com"
                  className="h-11 rounded-[14px] border-white/8 bg-[#1A1A1A] pl-10 text-sm text-white placeholder:text-zinc-500"
                />
              </div>
              <div className="relative min-w-[128px]">
                <select
                  value={invitePermission}
                  onChange={(event) => setInvitePermission(event.target.value as SharePermission)}
                  className="h-11 w-full appearance-none rounded-[14px] border border-white/8 bg-[#1A1A1A] px-3 pr-8 text-sm text-white outline-none"
                >
                  <option value="edit">Can edit</option>
                  <option value="comment">Can comment</option>
                  <option value="view">Can view</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              </div>
              <Button
                type="button"
                disabled={inviteDisabled}
                onClick={handleInvite}
                className="h-11 rounded-[14px] bg-[#2A2A2A] px-4 text-sm font-medium text-white hover:bg-[#333333]"
              >
                {isInviting ? 'Inviting...' : 'Invite'}
              </Button>
            </div>
            <p className="text-xs leading-5 text-zinc-500">
              Use commas, semicolons, spaces, or line breaks to add multiple emails.
            </p>
          </section>

          <section className="space-y-3">
            <div className="text-sm font-medium text-zinc-400">Who has access</div>
            {renderPersonRow({
              title: workspaceSummary.title,
              subtitle: workspaceSummary.subtitle,
              avatarLabel: workspaceSummary.title.slice(0, 1).toUpperCase(),
              trailing: 'Project',
            })}
            {currentUser
              ? renderPersonRow({
                  title: currentUser.displayName,
                  subtitle: currentUser.email,
                  avatarLabel: getInitials(currentUser.displayName),
                  avatarUrl: currentUser.avatarUrl,
                  trailing: 'Owner',
                })
              : null}
          </section>
        </div>

        <div className="flex items-center gap-3 border-t border-white/8 px-4 py-4">
          <div className="flex flex-1 items-center gap-2 rounded-[16px] border border-white/8 bg-[#161616] px-3 py-2.5">
            <Eye className="h-4 w-4 text-zinc-400" />
            <select
              value={linkPermission}
              onChange={(event) => setLinkPermission(event.target.value as SharePermission)}
              className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-zinc-200 outline-none"
            >
              <option value="view">Anyone with link can view</option>
              <option value="comment">Anyone with link can comment</option>
              <option value="edit">Anyone with link can edit</option>
            </select>
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </div>
          <Button
            type="button"
            onClick={handleCopyLink}
            disabled={isCopying || !projectId}
            className="h-11 rounded-[14px] bg-[#8FD97D] px-4 text-sm font-semibold text-[#0D130D] hover:bg-[#9ce38b]"
          >
            <Link2 className="mr-2 h-4 w-4" />
            {isCopying ? 'Copying...' : 'Copy link'}
          </Button>
        </div>

        <div className="px-4 pb-4 text-xs text-zinc-500">
          {shareLink ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-[#171717] px-3 py-1.5">
              <Globe2 className="h-3.5 w-3.5 text-zinc-500" />
              {getPermissionLabel(linkPermission)} link ready
            </span>
          ) : (
            'Share links are created on demand and copied to your clipboard.'
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default ProjectSharePopover;
