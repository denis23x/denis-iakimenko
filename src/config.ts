export const SITE = {
  website: "https://www.denis-iakimenko.com",
  author: "Denis Iakimenko",
  profile: "https://github.com/denis23x",
  desc: "Senior Software Engineer | Interactive & Backend Systems",
  title: "Tech Notes",
  ogImage: null,
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 4,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: true,
    text: "Edit",
    url: "https://github.com/denis23x/denis-iakimenko/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "en", // html lang code. Set this empty and default will be "en"
  timezone: "Asia/Bangkok", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
} as const;
