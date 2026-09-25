import { memo } from "react";
import Markdown from "react-markdown";
// Repository/model content cannot execute HTML or trigger image beacons.
export const SafeMarkdown = memo(function SafeMarkdown({
  children,
}: {
  children: string;
}) {
  return (
    <Markdown
      skipHtml
      components={{
        img: () => null,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
      urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : "")}
    >
      {children}
    </Markdown>
  );
});
