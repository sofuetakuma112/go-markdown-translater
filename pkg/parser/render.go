package parser

import (
	"fmt"
	"strconv"
	"strings"
)

func (n NodeType) String() string {
	switch n {
	case Heading:
		return "Heading"
	case Paragraph:
		return "Paragraph"
	case Item:
		return "Item"
	case OrderedItem:
		return "OrderedItem"
	case CodeBlock:
		return "CodeBlock"
	case Image:
		return "Image"
	case Table:
		return "Table"
	case Blank:
		return "Blank"
	case Other:
		return "Other"
	default:
		return "Unknown"
	}
}

func (n Node) String() string {
	return fmt.Sprintf("{Type:%s Text:%s NestSpaceCount:%d HeadingLevel:%d}", n.Type, n.Text, n.NestSpaceCount, n.HeadingLevel)
}

func nodeToMarkdown(node *Node) string {
	prefix := strings.Repeat(" ", node.NestSpaceCount)
	text := node.Text
	if node.TranslatedText != "" {
		text = node.TranslatedText
	}

	switch node.Type {
	case Heading:
		return prefix + strings.Repeat("#", node.HeadingLevel) + " " + text + "\n"
	case Paragraph:
		return prefix + text + "\n"
	case Item:
		return prefix + "- " + text + "\n"
	case OrderedItem:
		orderNum := strconv.Itoa(node.OrderedItemNum)
		return prefix + orderNum + ". " + text + "\n"
	case CodeBlock:
		return prefix + "```" + node.CodeLang + "\n" + text + "\n" + prefix + "```\n"
	case Image:
		return prefix + text + "\n"
	case Table:
		return prefix + text + "\n"
	case Blank:
		return "\n"
	default:
		return ""
	}
}

func NodesToMarkdown(nodes []*Node) string {
	var markdown strings.Builder

	for _, node := range nodes {
		markdown.WriteString(nodeToMarkdown(node))
	}

	return strings.TrimSuffix(markdown.String(), "\n")
}
