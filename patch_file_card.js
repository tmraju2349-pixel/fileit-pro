const fs = require('fs');
const filePath = 'artifacts/fileit/src/components/file-card.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// Add Star to lucide-react import
code = code.replace(
  'import { File as FileIcon, MoreVertical, Copy, Trash2, Download, ExternalLink, Eye, FolderInput } from "lucide-react";',
  'import { File as FileIcon, MoreVertical, Copy, Trash2, Download, ExternalLink, Eye, FolderInput, Star } from "lucide-react";'
);

// Add query client
code = code.replace(
  'import { useState } from "react";',
  'import { useState } from "react";\nimport { useQueryClient } from "@tanstack/react-query";'
);

// Add query client to component
code = code.replace(
  'const { toast } = useToast();',
  'const { toast } = useToast();\n  const queryClient = useQueryClient();'
);

// Add toggle star function
code = code.replace(
  'const copyLink = async () => {',
  `const toggleStar = async () => {
    try {
      const res = await fetch(\`/api/files/\${file.id}/star\`, { method: "PUT" });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
        toast({ title: file.isStarred ? "Unstarred" : "Starred", description: file.isStarred ? "File will expire normally." : "File will be kept forever." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update file." });
    }
  };
  
  const copyLink = async () => {`
);

// Add Star button to actions
code = code.replace(
  '<DropdownMenuItem onClick={() => onMove(file.id)}>',
  `<DropdownMenuItem onClick={toggleStar}>
              <Star className={\`mr-2 h-4 w-4 \${file.isStarred ? "fill-yellow-400 text-yellow-400" : ""}\`} />
              <span>{file.isStarred ? "Unstar (Allow Expiry)" : "Star (Keep Forever)"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove(file.id)}>`
);

// Show a star badge on the card
code = code.replace(
  '<div className="flex flex-col min-w-0">',
  `<div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate" title={file.originalName}>
              {file.originalName}
            </h3>
            {file.isStarred && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />}
          </div>`
);
code = code.replace(
  '<h3 className="text-sm font-semibold truncate" title={file.originalName}>\n            {file.originalName}\n          </h3>',
  ''
);

fs.writeFileSync(filePath, code);
