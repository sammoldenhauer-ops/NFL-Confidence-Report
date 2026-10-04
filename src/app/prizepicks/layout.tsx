import { Press_Start_2P, VT323 } from "next/font/google";
import Sidebar from "./components/Sidebar";

const ppTitle = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-pp-title" });
const ppBody = VT323({ weight: "400", subsets: ["latin"], variable: "--font-pp-body" });

export default function PrizePicksLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`pp-theme ${ppTitle.variable} ${ppBody.variable}`}>
      <Sidebar />
      <main className="min-h-dvh px-4 pb-16 pt-20">{children}</main>
    </div>
  );
}
