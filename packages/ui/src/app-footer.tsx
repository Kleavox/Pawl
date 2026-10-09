export interface AppFooterProps {
  product?: string;
  rootOrigin?: string;
}

export function AppFooter({ product, rootOrigin }: AppFooterProps) {
  return (
    <footer className="pw-footer">
      <div className="pw-footer-inner">
        <span className="pw-footer-wm">
          PA<span>WL</span>
          {product ? <span> / {product}</span> : null}
        </span>
        {rootOrigin ? (
          <div className="pw-footer-links">
            <a href={`${rootOrigin}/privacy`}>Privacy</a>
            <a href={`${rootOrigin}/terms`}>Terms</a>
          </div>
        ) : null}
        <span className="pw-footer-copy">
          &copy; {new Date().getFullYear()} Pawl
        </span>
      </div>
    </footer>
  );
}
