import Link from "next/link";
import { ArrowRight, Monitor, ScanLine, ShieldCheck } from "lucide-react";

const entries = [
  {
    href: "/join",
    title: "宾客登记",
    description: "扫码填写到场信息",
    icon: ScanLine,
  },
  {
    href: "/admin",
    title: "现场后台",
    description: "统计、分组与异常处理",
    icon: ShieldCheck,
  },
  {
    href: "/screen",
    title: "仪式大屏",
    description: "只读抽奖展示页面",
    icon: Monitor,
  },
];

export default function Home() {
  return (
    <main className="home-shell">
      <section className="home-intro" aria-labelledby="home-title">
        <p className="home-kicker">Wedding guest desk</p>
        <h1 id="home-title">婚礼宾客登记与抽奖</h1>
        <p className="home-summary">
          为现场登记、自动分组和公平抽奖准备的一体化工作台。
        </p>
      </section>

      <nav className="entry-list" aria-label="系统入口">
        {entries.map(({ href, title, description, icon: Icon }) => (
          <Link className="entry-link" href={href} key={href}>
            <span className="entry-icon" aria-hidden="true">
              <Icon size={22} strokeWidth={1.8} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <ArrowRight className="entry-arrow" size={20} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </main>
  );
}
