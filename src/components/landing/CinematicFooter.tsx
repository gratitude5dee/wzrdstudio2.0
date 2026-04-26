import { Link } from 'react-router-dom';

const CinematicFooter = () => {
  return (
    <footer className="flex flex-col sm:flex-row justify-between items-center px-8 py-10 border-t border-white/5 mt-20 text-[10px] tracking-[0.2em] text-white/50 uppercase">
      <div className="flex items-center gap-3 mb-4 sm:mb-0">
        <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center text-black font-black text-[10px]">
          W
        </div>
        <span>&copy; {new Date().getFullYear()} WZRD.Studio</span>
      </div>
      <nav className="flex items-center gap-8">
        <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
        <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
        <Link to="/api" className="hover:text-white transition-colors">Studio API</Link>
        <a href="mailto:careers@wzrd.studio" className="hover:text-white transition-colors">Careers</a>
      </nav>
    </footer>
  );
};

export default CinematicFooter;
