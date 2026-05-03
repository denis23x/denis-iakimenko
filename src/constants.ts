import type { Props } from "astro";
import IconLinktree from "@/assets/icons/IconLinktree.svg";
import IconGitHub from "@/assets/icons/IconGitHub.svg";
import IconBrandX from "@/assets/icons/IconBrandX.svg";
import IconLinkedin from "@/assets/icons/IconLinkedin.svg";
import IconFacebook from "@/assets/icons/IconFacebook.svg";
import IconTelegram from "@/assets/icons/IconTelegram.svg";
import IconThreads from "@/assets/icons/IconThreads.svg";
import IconReddit from "@/assets/icons/IconReddit.svg";
import { SITE } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  icon: (_props: Props) => Element;
}

export const SOCIALS: Social[] = [
  {
    name: "Linktree",
    href: "https://linktr.ee/denis23x",
    linkTitle: `${SITE.author} on Linktree`,
    icon: IconLinktree,
  },
  {
    name: "GitHub",
    href: "https://github.com/denis23x",
    linkTitle: `${SITE.author} on GitHub`,
    icon: IconGitHub,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/denis-iakimenko/",
    linkTitle: `${SITE.author} on LinkedIn`,
    icon: IconLinkedin,
  },
] as const;

export const SHARE_LINKS: Social[] = [
  {
    name: "X",
    href: "https://twitter.com/intent/tweet?url=",
    linkTitle: `Share this post on X`,
    icon: IconBrandX,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: IconFacebook,
  },
  {
    name: "Threads",
    href: "https://www.threads.com/intent/post?url=",
    linkTitle: `Share this post on Threads`,
    icon: IconThreads,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/sharing/share-offsite/?url=",
    linkTitle: `Share this post on LinkedIn`,
    icon: IconLinkedin,
  },
  {
    name: "Reddit",
    href: "https://www.reddit.com/submit?title=Denis%20Iakimenko&url=",
    linkTitle: `Share this post on Reddit`,
    icon: IconReddit,
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?text=Denis%20Iakimenko&url=",
    linkTitle: `Share this post via Telegram`,
    icon: IconTelegram,
  },
] as const;
