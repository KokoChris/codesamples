import React from "react";
import PropTypes from "prop-types";
import i18n from "shared/i18n";

export default class AwesomeWidget extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasResized: false };

    this.handleClick = this.handleClick.bind(this);
  }

  componentDidMount() {
    if (this.props.resize) {
      window.addEventListener("resize", () => {
        this.setState({ hasResized: true });
      });
    }
  }

  handleClick() {
    this.prop.onClick();
  }

  render() {
    return (
      <div className="awesome_design_system_flex">
        {this.state.hasResized ? (
          <p style={{ width: "200px" }}>Resize indicatior</p>
        ) : null}
        <h2>{i18n.t("awesome_widget.header")}</h2>
        <button onClick={this.handleClick}>
          {i18n.t("awesome_widget.primary_cta")}
        </button>
      </div>
    );
  }
}
AwesomeWidget.PropTypes = {
  onClick: PropTypes.func.isRequired,
};
