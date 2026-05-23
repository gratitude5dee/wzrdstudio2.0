import { Link } from 'react-router-dom';
import { Linkedin, Youtube } from 'lucide-react';

const MassiveFooter = () => {
  return (
    <footer className="border-t border-white/10 bg-black pt-20 pb-10 px-6">

      {/* Bottom content */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">
          {/* Left: Logo + social */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <img src="/lovable-uploads/wzrdtechlogo.png" alt="WZRD Studio" className="h-7 object-contain" />
            </div>
            <div className="flex items-center gap-4">
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors">
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Right: Link columns */}
          <div className="flex gap-16 md:gap-24">
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] mb-4">Company</div>
              <nav className="flex flex-col gap-3">
                <Link to="/about" className="text-sm text-zinc-500 hover:text-white transition-colors">About Us</Link>
                <a href="mailto:hello@wzrd.tech" className="text-sm text-zinc-500 hover:text-white transition-colors">Contact</a>
                <a href="mailto:careers@wzrd.tech" className="text-sm text-zinc-500 hover:text-white transition-colors">Careers</a>
              </nav>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] mb-4">Resources</div>
              <nav className="flex flex-col gap-3">
                <Link to="/docs" className="text-sm text-zinc-500 hover:text-white transition-colors">Documentation</Link>
                <Link to="/api" className="text-sm text-zinc-500 hover:text-white transition-colors">Studio API</Link>
                <Link to="/privacy" className="text-sm text-zinc-500 hover:text-white transition-colors">Privacy</Link>
                <Link to="/terms" className="text-sm text-zinc-500 hover:text-white transition-colors">Terms</Link>
              </nav>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-white/5 pt-6">
          <p className="text-[11px] text-zinc-600 tracking-wide">
            &copy; {new Date().getFullYear()} WZRD.tech — All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default MassiveFooter;
